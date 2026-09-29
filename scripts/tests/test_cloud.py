"""Publisher behavior with AWS and upload networking replaced by recording doubles."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('syas_cloud', Path(__file__).resolve().parents[1] / 'cloud.py')
cloud = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(cloud)


class FrontendPublishing(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.dist = self.root / 'dist'
        (self.dist / 'assets').mkdir(parents=True)
        (self.dist / 'images').mkdir()
        (self.dist / 'index.html').write_text('<html>SYAS</html>')
        (self.dist / 'assets/index-Ab12CD34.js').write_text('console.log("SYAS")')
        (self.dist / 'assets/index-Ab12CD34.css').write_text('body{color:coral}')
        (self.dist / 'images/entrance.svg').write_text('<svg/>')
        self.values = {
            'Region': 'ap-southeast-2', 'ArtifactsBucketName': 'syas-artifacts',
            'FrontendBucketName': 'syas-frontend', 'DistributionId': 'EDISTRIBUTION',
            'DistributionDomainName': 'example.cloudfront.net',
            'FrontendUrl': 'https://example.cloudfront.net',
            # Historical outputs keep the original implementation callable for behavioral RED.
            'AmplifyAppId': 'old-app', 'AmplifyBranchName': 'test',
        }
        self.outputs = self.root / 'outputs.json'
        self.calls = []
        self.failure_key = None
        self.fail_invalidation = False
        self.versioning = 'Enabled'
        self.live_domain = 'example.cloudfront.net'
        self.live_origin = 'syas-frontend.s3.ap-southeast-2.amazonaws.com'

    def fake_aws(self, args, command, mutate=False):
        self.calls.append((command, mutate))
        if command[:2] == ['s3api', 'put-object']:
            key = command[command.index('--key') + 1]
            if key == self.failure_key:
                raise subprocess.CalledProcessError(1, command)
        if command[:2] == ['cloudfront', 'create-invalidation'] and self.fail_invalidation:
            raise subprocess.CalledProcessError(1, command)
        return {
            'Status': self.versioning,
            'Distribution': {
                'DomainName': self.live_domain, 'Status': 'Deployed',
                'DistributionConfig': {
                    'Enabled': True, 'DefaultCacheBehavior': {'TargetOriginId': 'FrontendS3'},
                    'Origins': {'Items': [{'Id': 'FrontendS3', 'DomainName': self.live_origin,
                                          'OriginAccessControlId': 'EOAC', 'S3OriginConfig': {'OriginAccessIdentity': ''}}]},
                },
            },
            'VersionId': 'version-' + str(len(self.calls)),
            'Invalidation': {'Id': 'IINVALIDATION'},
            'zipUploadUrl': 'https://example.invalid/upload', 'jobId': 'old-job',
        }

    def invoke(self, live=True):
        self.outputs.write_text(json.dumps({'Stacks': [{'Outputs': [
            {'OutputKey': key, 'OutputValue': value} for key, value in self.values.items()
        ]}]}))
        argv = ['cloud.py', *(['--live'] if live else []), 'publish-frontend',
                '--bootstrap-outputs', str(self.outputs), '--directory', str(self.dist)]
        output = io.StringIO()
        # The obsolete Amplify path's network is intercepted too, so RED cannot send requests.
        with patch.object(cloud, 'ROOT', self.root), patch.object(sys, 'argv', argv), \
                patch.object(cloud, 'aws', side_effect=self.fake_aws), \
                patch('urllib.request.urlopen') as upload, contextlib.redirect_stdout(output), \
                contextlib.redirect_stderr(io.StringIO()):
            upload.return_value.__enter__.return_value.status = 200
            cloud.main()
        return output.getvalue()

    def uploads(self):
        return [cmd for cmd, _ in self.calls if cmd[:2] == ['s3api', 'put-object']]

    def test_dry_run_describes_s3_plan_without_aws_or_manifest_writes(self):
        output = self.invoke(live=False)
        self.assertIn('"dryRun": true', output)
        plan = json.loads(output)
        self.assertEqual(plan['bucket'], 'syas-frontend')
        self.assertEqual(plan['files'][-1]['key'], 'index.html')
        self.assertEqual(plan['invalidate'], ['/*'])
        self.assertEqual(self.calls, [])
        self.assertFalse((self.root / 'infra/.artifacts/frontend-manifest.json').exists())

    def test_uploads_dependencies_then_html_and_invalidates_without_deleting(self):
        self.invoke()
        uploads = self.uploads()
        keys = [cmd[cmd.index('--key') + 1] for cmd in uploads]
        self.assertEqual(set(keys), {'assets/index-Ab12CD34.js', 'assets/index-Ab12CD34.css',
                                    'images/entrance.svg', 'index.html'})
        self.assertEqual(keys[-1], 'index.html')
        self.assertEqual(self.calls[-1][0][:2], ['cloudfront', 'create-invalidation'])
        self.assertIn('/*', self.calls[-1][0])
        self.assertEqual([cmd[:2] for cmd, mutate in self.calls if not mutate],
                         [['s3api', 'get-bucket-versioning'], ['cloudfront', 'get-distribution']])
        self.assertTrue(all(cmd[0] in ['s3api', 'cloudfront'] for cmd, _ in self.calls))
        self.assertFalse(any('delete' in part or part == '--acl' for cmd, _ in self.calls for part in cmd))

    def test_content_types_and_cache_policy_distinguish_hashed_and_stable_files(self):
        self.invoke()
        uploads = self.uploads()
        self.assertEqual(len(uploads), 4)
        for cmd in uploads:
            key = cmd[cmd.index('--key') + 1]
            cache = cmd[cmd.index('--cache-control') + 1]
            content_type = cmd[cmd.index('--content-type') + 1]
            if key.startswith('assets/'):
                self.assertIn('max-age=31536000', cache)
                self.assertIn('immutable', cache)
            else:
                self.assertIn('max-age=0', cache)
                self.assertNotIn('immutable', cache)
            if key.endswith('.js'):
                self.assertIn('javascript', content_type)
            if key.endswith('.css'):
                self.assertIn('text/css', content_type)
            if key.endswith('.svg'):
                self.assertEqual(content_type, 'image/svg+xml')

    def test_records_real_object_versions_invalidation_and_release_history(self):
        self.invoke()
        manifest = self.root / 'infra/.artifacts/frontend-manifest.json'
        self.assertTrue(manifest.is_file(), 'A publish must leave an inspectable release manifest')
        data = json.loads(manifest.read_text())
        self.assertEqual(data['bucket'], 'syas-frontend')
        self.assertEqual(data['invalidationId'], 'IINVALIDATION')
        self.assertEqual(data['status'], 'invalidation-submitted')
        self.assertTrue(all(row['version'].startswith('version-') for row in data['files']))
        self.assertEqual(len(list((manifest.parent / 'frontend-releases').glob('*.json'))), 1)

    def test_upload_failure_never_replaces_index_or_invalidates(self):
        self.failure_key = 'assets/index-Ab12CD34.js'
        with self.assertRaises(subprocess.CalledProcessError):
            self.invoke()
        self.assertFalse(any(cmd[cmd.index('--key') + 1] == 'index.html' for cmd in self.uploads()))
        self.assertFalse(any(cmd[:2] == ['cloudfront', 'create-invalidation'] for cmd, _ in self.calls))

    def test_invalidation_failure_records_published_objects_for_recovery(self):
        self.fail_invalidation = True
        with self.assertRaises(subprocess.CalledProcessError):
            self.invoke()
        manifest = self.root / 'infra/.artifacts/frontend-manifest.json'
        self.assertTrue(manifest.is_file())
        self.assertEqual(json.loads(manifest.read_text())['status'], 'invalidation-pending')

    def test_old_amplify_outputs_are_rejected_before_any_cloud_calls(self):
        del self.values['FrontendBucketName']
        with self.assertRaises(SystemExit):
            self.invoke()
        self.assertEqual(self.calls, [])

    def test_region_mismatch_and_artifact_bucket_reuse_fail_before_cloud_calls(self):
        for key, value in [('Region', 'us-east-1'), ('FrontendBucketName', 'syas-artifacts')]:
            with self.subTest(key=key):
                previous = self.values[key]
                self.values[key] = value
                with self.assertRaises(SystemExit):
                    self.invoke()
                self.assertEqual(self.calls, [])
                self.values[key] = previous

    def test_env_files_and_symlinks_are_not_published(self):
        for bad in ['.env', 'linked.txt']:
            with self.subTest(file=bad):
                path = self.dist / bad
                if bad == 'linked.txt':
                    target = self.root / 'outside.txt'
                    target.write_text('not website content')
                    path.symlink_to(target)
                else:
                    path.write_text('NOT_A_PUBLIC_FILE=value')
                with self.assertRaises(SystemExit):
                    self.invoke()
                self.assertEqual(self.calls, [])
                path.unlink()

    def test_missing_index_is_rejected_before_cloud_calls(self):
        (self.dist / 'index.html').unlink()
        with self.assertRaises(SystemExit):
            self.invoke()
        self.assertEqual(self.calls, [])

    def test_missing_artifact_output_cannot_bypass_bucket_separation(self):
        del self.values['ArtifactsBucketName']
        self.values['FrontendBucketName'] = 'syas-artifacts'
        with self.assertRaises(SystemExit):
            self.invoke()
        self.assertEqual(self.calls, [])

    def test_live_targets_are_verified_before_any_mutation(self):
        for field, value in [('versioning', 'Suspended'), ('live_domain', 'different.cloudfront.net'),
                             ('live_origin', 'different-bucket.s3.ap-southeast-2.amazonaws.com')]:
            with self.subTest(field=field):
                original = getattr(self, field)
                setattr(self, field, value)
                self.calls = []
                with self.assertRaises(SystemExit):
                    self.invoke()
                self.assertFalse(any(mutate for _, mutate in self.calls))
                setattr(self, field, original)

    def test_hidden_credentials_rejected_and_public_well_known_allowed(self):
        directory = self.dist / '.aws'
        directory.mkdir()
        (directory / 'credentials').write_text('inert test data')
        with self.assertRaises(SystemExit):
            self.invoke(live=False)
        (directory / 'credentials').unlink()
        directory.rmdir()
        (self.dist / '.well-known').mkdir()
        (self.dist / '.well-known/security.txt').write_text('Contact: test@example.test')
        plan = json.loads(self.invoke(live=False))
        self.assertIn('.well-known/security.txt', [item['key'] for item in plan['files']])

    def test_invalid_distribution_identifiers_are_rejected_without_aws_calls(self):
        for key, value in [('DistributionId', 'not a distribution'),
                           ('DistributionDomainName', 'example.com'), ('FrontendBucketName', 'INVALID BUCKET')]:
            with self.subTest(key=key):
                original = self.values[key]
                self.values[key] = value
                with self.assertRaises(SystemExit):
                    self.invoke()
                self.assertEqual(self.calls, [])
                self.values[key] = original


if __name__ == '__main__':
    unittest.main()
