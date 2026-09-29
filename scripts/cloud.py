#!/usr/bin/env python3
"""Explicit AWS preparation/deployment commands. No command executes a change set.

Cloud mutations require --live. Without it, commands print a redacted execution plan.
Requires AWS CLI v2 configured outside this repository.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import mimetypes
from pathlib import Path
import re
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def outputs(path):
    value = json.loads(path.read_text())
    rows = value.get('Stacks', [{}])[0].get('Outputs', []) if isinstance(value, dict) else value
    return {row['OutputKey']: row['OutputValue'] for row in rows}


def aws(args, command, mutate=False):
    cmd = ['aws', '--region', args.region, '--no-cli-pager', *command, '--output', 'json']
    if mutate and not args.live:
        print(json.dumps({'dryRun': True, 'command': cmd}, indent=2))
        return None
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return json.loads(result.stdout or '{}')


def change_set(args, template, parameters):
    with tempfile.TemporaryDirectory() as directory:
        parameter_file = Path(directory) / 'parameters.json'
        parameter_file.write_text(json.dumps([{'ParameterKey': key, 'ParameterValue': value} for key, value in parameters.items()]))
        command = ['cloudformation', 'create-change-set', '--stack-name', args.stack,
                   '--change-set-name', args.change_set, '--change-set-type', args.type,
                   '--template-body', f'file://{ROOT / "infra" / template}', '--parameters', f'file://{parameter_file}']
        if template == 'application.yaml':
            command += ['--capabilities', 'CAPABILITY_IAM']
        if not args.live:
            print(json.dumps({'parameters': parameters, 'note': 'Temporary parameters file is generated during a live run.'}, indent=2))
        result = aws(args, command, mutate=True)
        if result:
            print(json.dumps(result, indent=2))
            print('Change set created; wait for creation and inspect it before executing separately.')


def frontend_plan(args, bootstrap, parser):
    required = ['Region', 'ArtifactsBucketName', 'FrontendBucketName', 'DistributionId', 'DistributionDomainName', 'FrontendUrl']
    if any(not bootstrap.get(key) for key in required):
        parser.error('S3/CloudFront bootstrap outputs are required. Deploy the revised bootstrap and refresh its outputs file; old Amplify outputs cannot publish this frontend.')
    if bootstrap['Region'] != args.region:
        parser.error('Frontend bucket region must match the deployment region.')
    if bootstrap['FrontendBucketName'] == bootstrap.get('ArtifactsBucketName'):
        parser.error('The frontend must use its own bucket, separate from backend artifacts.')
    if any(not re.fullmatch(r'[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]', bootstrap[key])
           for key in ['FrontendBucketName', 'ArtifactsBucketName']):
        parser.error('Bootstrap outputs contain an invalid S3 bucket name.')
    if not re.fullmatch(r'[A-Z0-9]+', bootstrap['DistributionId']):
        parser.error('Bootstrap outputs contain an invalid CloudFront distribution ID.')
    if not re.fullmatch(r'[a-z0-9-]+\.cloudfront\.net', bootstrap['DistributionDomainName']):
        parser.error('Bootstrap outputs must contain the generated CloudFront domain name.')
    if bootstrap['FrontendUrl'] != 'https://' + bootstrap['DistributionDomainName']:
        parser.error('FrontendUrl must match the HTTPS CloudFront domain in bootstrap outputs.')
    if args.directory.is_symlink():
        parser.error('Frontend build directory must not be a symlink.')
    if not (args.directory / 'index.html').is_file():
        parser.error('Frontend dist/index.html is missing; build the frontend first.')
    entries = sorted(args.directory.rglob('*'))
    files = []
    for file in entries:
        relative = file.relative_to(args.directory)
        hidden = any(part.startswith('.') and not (index == 0 and part == '.well-known')
                     for index, part in enumerate(relative.parts))
        if file.is_symlink() or hidden or 'node_modules' in relative.parts:
            parser.error(f'Refusing to publish non-website content: {relative}')
        if not file.is_file():
            continue
        content_type = mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
        if file.suffix == '.js':
            content_type = 'text/javascript'
        if content_type.startswith('text/'):
            content_type += '; charset=utf-8'
        hashed = relative.parts[0] == 'assets' and bool(re.search(r'-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9.]+$', file.name))
        files.append({
            'key': relative.as_posix(), 'sha256': hashlib.sha256(file.read_bytes()).hexdigest(),
            'contentType': content_type,
            'cacheControl': 'public,max-age=31536000,immutable' if hashed else 'no-cache,max-age=0,must-revalidate',
        })
    files.sort(key=lambda item: (item['key'] == 'index.html', item['key']))
    return {
        'dryRun': not args.live, 'region': args.region,
        'bucket': bootstrap['FrontendBucketName'], 'distributionId': bootstrap['DistributionId'],
        'frontendUrl': bootstrap['FrontendUrl'], 'files': files,
        'invalidate': ['/*'], 'preservesExistingObjects': True,
    }


def publish_frontend(args, parser):
    plan = frontend_plan(args, outputs(args.bootstrap_outputs), parser)
    if not args.live:
        print(json.dumps(plan, indent=2))
        return
    # Reject stale/misdirected outputs before writing any object. Dry runs never reach AWS.
    versioning = aws(args, ['s3api', 'get-bucket-versioning', '--bucket', plan['bucket']])
    if versioning.get('Status') != 'Enabled':
        parser.error('Frontend bucket versioning must be Enabled before publication.')
    actual = aws(args, ['cloudfront', 'get-distribution', '--id', plan['distributionId']]).get('Distribution', {})
    settings = actual.get('DistributionConfig', {})
    target = settings.get('DefaultCacheBehavior', {}).get('TargetOriginId')
    origins = settings.get('Origins', {}).get('Items', [])
    origin = next((item for item in origins if item.get('Id') == target), {})
    if (actual.get('DomainName') != plan['frontendUrl'][len('https://'):]
            or not settings.get('Enabled') or actual.get('Status') != 'Deployed'
            or origin.get('DomainName') != f"{plan['bucket']}.s3.{args.region}.amazonaws.com"
            or origin.get('OriginPath') or not origin.get('OriginAccessControlId')
            or not isinstance(origin.get('S3OriginConfig'), dict)):
        parser.error('The deployed CloudFront domain/private S3 origin must match the bootstrap outputs. Wait for distribution-deployed or refresh the outputs before retrying.')
    build_digest = hashlib.sha256(json.dumps(plan['files'], sort_keys=True).encode()).hexdigest()
    now = datetime.now(timezone.utc)
    release_name = now.strftime('%Y%m%dT%H%M%S%fZ') + '-' + build_digest[:12] + '.json'
    history = args.manifest.parent / 'frontend-releases' / release_name
    data = {key: plan[key] for key in ['region', 'bucket', 'distributionId', 'frontendUrl']}
    data.update({'builtFilesSha256': build_digest, 'publishedAt': now.isoformat(),
                 'status': 'uploading', 'files': [], 'invalidationId': None})

    def save_manifest():
        for target in [history, args.manifest]:
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_suffix('.tmp')
            temporary.write_text(json.dumps(data, indent=2) + '\n')
            temporary.replace(target)

    # Snapshot before cloud calls so a simultaneous local build cannot alter uploaded bytes.
    with tempfile.TemporaryDirectory(prefix='syas-frontend-') as directory:
        staging = Path(directory)
        for item in plan['files']:
            content = (args.directory / item['key']).read_bytes()
            if hashlib.sha256(content).hexdigest() != item['sha256']:
                parser.error('Frontend build changed while preparing publication. Build again and retry.')
            target = staging / item['key']
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
        save_manifest()
        try:
            for item in plan['files']:
                result = aws(args, ['s3api', 'put-object', '--bucket', plan['bucket'], '--key', item['key'],
                                    '--body', str(staging / item['key']), '--content-type', item['contentType'],
                                    '--cache-control', item['cacheControl'], '--server-side-encryption', 'AES256',
                                    '--metadata', 'sha256=' + item['sha256']], mutate=True)
                version = result.get('VersionId')
                if not version or version == 'null':
                    raise RuntimeError('Frontend bucket did not return a real object version. Verify bucket versioning before retrying.')
                data['files'].append({**item, 'version': version})
                save_manifest()
        except Exception:
            data['status'] = 'upload-failed'
            save_manifest()
            raise
    data['status'] = 'invalidation-pending'
    save_manifest()
    invalidation = aws(args, ['cloudfront', 'create-invalidation', '--distribution-id', plan['distributionId'],
                              '--paths', '/*'], mutate=True)
    data['invalidationId'] = invalidation['Invalidation']['Id']
    data['status'] = 'invalidation-submitted'
    save_manifest()
    print(json.dumps({**{key: data[key] for key in ['status', 'frontendUrl', 'distributionId', 'invalidationId']},
                      'manifest': str(args.manifest), 'releaseManifest': str(history)}, indent=2))
    print('Files uploaded. Wait for invalidation-completed, then check the website and its deep links.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--region', default='ap-southeast-2')
    parser.add_argument('--live', action='store_true', help='Permit this explicitly selected cloud mutation')
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('validate', help='Read-only AWS ValidateTemplate for both templates')
    for name in ['bootstrap-change-set', 'application-change-set']:
        sub = commands.add_parser(name)
        sub.add_argument('--stack', required=True)
        sub.add_argument('--change-set', required=True)
        sub.add_argument('--type', choices=['CREATE', 'UPDATE'], required=True)
        sub.add_argument('--environment', choices=['dev', 'test', 'prod'], default='test')
        if name == 'application-change-set':
            sub.add_argument('--bootstrap-outputs', type=Path, required=True)
            sub.add_argument('--artifact', type=Path, required=True, help='JSON output from upload-backend')
            sub.add_argument('--layer-version', type=int, default=30)
            sub.add_argument('--alarm-topic', default='')
    upload = commands.add_parser('upload-backend')
    upload.add_argument('--bootstrap-outputs', type=Path, required=True)
    upload.add_argument('--file', type=Path, required=True)
    upload.add_argument('--manifest', type=Path, required=True)
    publish = commands.add_parser('publish-frontend')
    publish.add_argument('--bootstrap-outputs', type=Path, required=True)
    publish.add_argument('--directory', type=Path, default=ROOT / 'dist')
    publish.add_argument('--manifest', type=Path, default=ROOT / 'infra/.artifacts/frontend-manifest.json')
    args = parser.parse_args()
    if args.command == 'validate':
        for name in ['bootstrap', 'application']:
            print(json.dumps(aws(args, ['cloudformation', 'validate-template', '--template-body', f'file://{ROOT / "infra" / (name + ".yaml")}']), indent=2))
    elif args.command == 'bootstrap-change-set':
        change_set(args, 'bootstrap.yaml', {'Environment': args.environment})
    elif args.command == 'application-change-set':
        bootstrap = outputs(args.bootstrap_outputs)
        artifact = json.loads(args.artifact.read_text())
        if artifact['bucket'] != bootstrap['ArtifactsBucketName'] or artifact.get('region') != args.region:
            parser.error('Artifact bucket/region must match the bootstrap and deployment region.')
        if not artifact.get('version') or artifact['version'] == 'null':
            parser.error('A real versioned S3 object is required.')
        if args.layer_version < 1:
            parser.error('Layer version must be pinned to a positive integer.')
        change_set(args, 'application.yaml', {
            'Environment': args.environment, 'FrontendOrigin': bootstrap['FrontendUrl'],
            'BackendArtifactBucket': artifact['bucket'], 'BackendArtifactKey': artifact['key'],
            'BackendArtifactVersion': artifact['version'],
            'WebAdapterLayerArn': f'arn:aws:lambda:{args.region}:753240598075:layer:LambdaAdapterLayerArm64:{args.layer_version}',
            'AlarmTopicArn': args.alarm_topic,
        })
    elif args.command == 'upload-backend':
        bootstrap = outputs(args.bootstrap_outputs)
        with zipfile.ZipFile(args.file) as archive:
            metadata = json.loads(archive.read('syas-build.json'))
            if metadata != {'runtime': 'python3.13', 'architecture': 'arm64'} or 'run.sh' not in archive.namelist():
                parser.error('Expected the Python 3.13 arm64 artifact from package-backend.py.')
        digest = hashlib.sha256(args.file.read_bytes()).hexdigest()
        key = f'backend/{digest}.zip'
        response = aws(args, ['s3api', 'put-object', '--bucket', bootstrap['ArtifactsBucketName'], '--key', key,
                              '--body', str(args.file.resolve()), '--server-side-encryption', 'AES256',
                              '--metadata', f'sha256={digest}'], mutate=True)
        if response:
            if not response.get('VersionId') or response['VersionId'] == 'null':
                raise SystemExit('Bucket did not return a version ID. Do not create an application change set.')
            args.manifest.parent.mkdir(parents=True, exist_ok=True)
            args.manifest.write_text(json.dumps({'bucket': bootstrap['ArtifactsBucketName'], 'key': key,
                                                'version': response['VersionId'], 'sha256': digest, 'region': args.region}, indent=2))
            print(f'Immutable artifact manifest saved to {args.manifest}')
    elif args.command == 'publish-frontend':
        publish_frontend(args, parser)


if __name__ == '__main__':
    main()
