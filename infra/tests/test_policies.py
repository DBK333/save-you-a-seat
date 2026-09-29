"""Policy regression tests invoke AWS's real Guard executable, never a replacement evaluator."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

import yaml

ROOT = Path(__file__).resolve().parents[2]
GUARD = os.environ.get('CFN_GUARD', str(ROOT / '.tools/infra/bin/cfn-guard'))


def template(name):
    return yaml.safe_load((ROOT / f'infra/{name}.yaml').read_text())


class Policies(unittest.TestCase):
    def check(self, data, expected, name='application'):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'fixture.json'
            path.write_text(json.dumps(data))
            result = subprocess.run(
                [GUARD, 'validate', '--rules', str(ROOT / 'infra/rules/common.guard'),
                 '--rules', str(ROOT / f'infra/rules/{name}.guard'), '--data', str(path), '--structured', '--output-format', 'json', '--show-summary', 'none'],
                capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, expected, result.stdout + result.stderr)

    def test_native_guard_unit_fixtures(self):
        result = subprocess.run([GUARD, 'test', '--rules-file', str(ROOT / 'infra/rules/common.guard'),
                                 '--test-data', str(ROOT / 'infra/tests/policy-fixtures.yaml')],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_complete_templates_pass(self):
        for name in ['bootstrap', 'application']:
            with self.subTest(name=name):
                self.check(template(name), 0, name)

    def test_empty_resources_fail_instead_of_skip(self):
        for name in ['bootstrap', 'application']:
            with self.subTest(name=name):
                self.check({'Resources': {}, 'Outputs': {}}, 19, name)

    def test_every_required_resource_is_required(self):
        for resource in ['FacilitiesTable', 'BookingsTable', 'CommunityTable', 'ImagesBucket',
                         'UserPool', 'UserPoolClient', 'StaffGroup', 'ApiFunction', 'Api',
                         'JwtAuthorizer', 'ApiLogGroup', 'FunctionLogGroup', 'FunctionErrorsAlarm',
                         'CreateBookingRoute', 'MyBookingsRoute', 'CancelBookingRoute',
                         'StaffReportsRoute', 'StaffDecisionRoute']:
            with self.subTest(resource=resource):
                data = template('application')
                del data['Resources'][resource]
                self.check(data, 19)

    def test_security_regressions_fail(self):
        mutations = [
            ('public images', ['Resources', 'ImagesBucket', 'Properties', 'PublicAccessBlockConfiguration', 'BlockPublicPolicy'], False),
            ('unencrypted images', ['Resources', 'ImagesBucket', 'Properties', 'BucketEncryption'], {}),
            ('unversioned images', ['Resources', 'ImagesBucket', 'Properties', 'VersioningConfiguration', 'Status'], 'Suspended'),
            ('state deletion', ['Resources', 'BookingsTable', 'DeletionPolicy'], 'Delete'),
            ('pitr disabled', ['Resources', 'BookingsTable', 'Properties', 'PointInTimeRecoverySpecification', 'PointInTimeRecoveryEnabled'], False),
            ('staff route public', ['Resources', 'StaffReportsRoute', 'Properties', 'AuthorizationType'], 'NONE'),
            ('ID token allowed', ['Resources', 'CreateBookingRoute', 'Properties', 'AuthorizationScopes'], []),
            ('client secret', ['Resources', 'UserPoolClient', 'Properties', 'GenerateSecret'], True),
            ('email unverified', ['Resources', 'UserPool', 'Properties', 'AutoVerifiedAttributes'], []),
            ('wildcard CORS', ['Resources', 'Api', 'Properties', 'CorsConfiguration', 'AllowOrigins'], ['*']),
            ('missing dev rule', ['Rules', 'LocalhostOnlyInDev', 'Assertions'], []),
            ('localhost in prod', ['Rules', 'LocalhostOnlyInDev', 'Assertions', 0, 'Assert'], {'Fn::Equals': [{'Ref': 'Environment'}, 'prod']}),
            ('wildcard resource', ['Resources', 'FunctionRole', 'Properties', 'Policies', 0, 'PolicyDocument', 'Statement', 0, 'Resource'], '*'),
            ('wildcard actions', ['Resources', 'FunctionRole', 'Properties', 'Policies', 0, 'PolicyDocument', 'Statement', 0, 'Action'], ['s3:*']),
            ('wrong architecture', ['Resources', 'ApiFunction', 'Properties', 'Architectures'], ['x86_64']),
            ('floating artifact', ['Resources', 'ApiFunction', 'Properties', 'Code', 'S3ObjectVersion'], 'latest'),
        ]
        for name, path, value in mutations:
            with self.subTest(name=name):
                data = template('application')
                cursor = data
                for part in path[:-1]:
                    cursor = cursor[part]
                cursor[path[-1]] = value
                self.check(data, 19)

    def test_required_outputs_do_not_disappear(self):
        for output in ['ApiUrl', 'UserPoolId', 'UserPoolClientId', 'ImagesBucketName', 'Region']:
            with self.subTest(output=output):
                data = template('application')
                del data['Outputs'][output]
                self.check(data, 19)

    def test_only_discovery_routes_are_public(self):
        data = template('application')
        public = {r['Properties']['RouteKey'] for r in data['Resources'].values()
                  if r['Type'] == 'AWS::ApiGatewayV2::Route'
                  and r['Properties'].get('AuthorizationType') == 'NONE'}
        self.assertEqual(public, {'GET /facilities', 'GET /facilities/{id}', 'GET /rooms/{id}/availability'})

    def test_contract_routes_match_infrastructure(self):
        contract = ROOT / 'contracts/openapi.json'
        spec = yaml.safe_load(contract.read_text())
        expected = {f'{method.upper()} {path}' for path, methods in spec['paths'].items()
                    for method in methods if method in {'get', 'post', 'patch', 'delete', 'put'}}
        actual = {r['Properties']['RouteKey'] for r in template('application')['Resources'].values()
                  if r['Type'] == 'AWS::ApiGatewayV2::Route'}
        self.assertEqual(actual, expected)


if __name__ == '__main__':
    unittest.main()
