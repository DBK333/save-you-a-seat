"""CloudFront hosting policies and behavior of the exact function embedded in YAML."""
import copy
import json
import subprocess
import unittest

import test_policies
from test_policies import template


class HostingPolicies(unittest.TestCase):
    check = test_policies.Policies.check

    def test_required_hosting_resources_and_outputs(self):
        data = template('bootstrap')
        required_resources = ['ArtifactsBucket', 'ArtifactsBucketPolicy', 'FrontendBucket',
                              'FrontendBucketPolicy', 'FrontendOriginAccessControl',
                              'FrontendCachePolicy', 'SpaRewriteFunction', 'FrontendDistribution']
        required_outputs = ['Region', 'ArtifactsBucketName', 'FrontendBucketName',
                            'DistributionId', 'DistributionDomainName', 'FrontendUrl']
        self.assertEqual(set(data['Outputs']), set(required_outputs))
        self.assertTrue(set(required_resources).issubset(data['Resources']), 'Private CloudFront hosting resources are required')
        for resource in required_resources:
            with self.subTest(missing_resource=resource):
                damaged = copy.deepcopy(data)
                del damaged['Resources'][resource]
                self.check(damaged, 19, 'bootstrap')
        for output in required_outputs:
            with self.subTest(missing_output=output):
                damaged = copy.deepcopy(data)
                del damaged['Outputs'][output]
                self.check(damaged, 19, 'bootstrap')

    def test_origin_and_cache_regressions_fail(self):
        data = template('bootstrap')
        self.assertIn('FrontendDistribution', data['Resources'], 'CloudFront distribution must replace Amplify')
        changes = [
            ('public frontend', ['Resources', 'FrontendBucket', 'Properties', 'PublicAccessBlockConfiguration', 'BlockPublicPolicy'], False),
            ('delete frontend data', ['Resources', 'FrontendBucket', 'DeletionPolicy'], 'Delete'),
            ('OAC unsigned', ['Resources', 'FrontendOriginAccessControl', 'Properties', 'OriginAccessControlConfig', 'SigningBehavior'], 'never'),
            ('HTTP viewers', ['Resources', 'FrontendDistribution', 'Properties', 'DistributionConfig', 'DefaultCacheBehavior', 'ViewerProtocolPolicy'], 'allow-all'),
            ('positive minimum ttl', ['Resources', 'FrontendCachePolicy', 'Properties', 'CachePolicyConfig', 'MinTTL'], 60),
            ('default caching HTML', ['Resources', 'FrontendCachePolicy', 'Properties', 'CachePolicyConfig', 'DefaultTTL'], 86400),
            ('short max ttl', ['Parameters', 'FrontendMaxTTL', 'Default'], 60),
            ('SPA function missing', ['Resources', 'FrontendDistribution', 'Properties', 'DistributionConfig', 'DefaultCacheBehavior', 'FunctionAssociations'], []),
            ('hide missing assets as HTML', ['Resources', 'FrontendDistribution', 'Properties', 'DistributionConfig', 'CustomErrorResponses'], [{'ErrorCode': 403, 'ResponseCode': 200, 'ResponsePagePath': '/index.html'}]),
            ('unpublished function', ['Resources', 'SpaRewriteFunction', 'Properties', 'AutoPublish'], False),
        ]
        for name, path, value in changes:
            with self.subTest(regression=name):
                damaged = copy.deepcopy(data)
                cursor = damaged
                for key in path[:-1]:
                    cursor = cursor[key]
                cursor[path[-1]] = value
                self.check(damaged, 19, 'bootstrap')

    def test_tls_required_separately_on_each_bucket_policy(self):
        data = template('bootstrap')
        self.assertIn('FrontendBucketPolicy', data['Resources'])
        for policy in ['ArtifactsBucketPolicy', 'FrontendBucketPolicy']:
            with self.subTest(policy=policy):
                damaged = copy.deepcopy(data)
                statements = damaged['Resources'][policy]['Properties']['PolicyDocument']['Statement']
                statements[:] = [s for s in statements if s.get('Sid') != 'RequireTLS']
                self.check(damaged, 19, 'bootstrap')

    def test_extra_policy_cannot_open_an_origin(self):
        data = template('bootstrap')
        extra = copy.deepcopy(data['Resources']['FrontendBucketPolicy'])
        extra['Properties']['PolicyDocument']['Statement'].append({
            'Sid': 'UnrestrictedRead', 'Effect': 'Allow', 'Principal': '*',
            'Action': 's3:GetObject', 'Resource': '*'})
        data['Resources']['ExtraBucketPolicy'] = extra
        self.check(data, 19, 'bootstrap')

    def test_tls_denial_must_cover_frontend_bucket_and_objects(self):
        data = template('bootstrap')
        for resource in [[], [{'Fn::GetAtt': ['FrontendBucket', 'Arn']}]]:
            with self.subTest(resource=resource):
                damaged = copy.deepcopy(data)
                deny = next(s for s in damaged['Resources']['FrontendBucketPolicy']['Properties']['PolicyDocument']['Statement'] if s['Effect'] == 'Deny')
                deny['Resource'] = resource
                self.check(damaged, 19, 'bootstrap')

    def test_only_distribution_scoped_read_is_allowed(self):
        data = template('bootstrap')
        self.assertIn('FrontendBucketPolicy', data['Resources'])
        for field, replacement in [('Principal', '*'), ('Action', 's3:*'), ('Resource', '*'),
                                   ('Condition', {}), ('Condition', {'StringEquals': {'AWS:SourceArn': '*'}})]:
            with self.subTest(field=field, replacement=replacement):
                damaged = copy.deepcopy(data)
                allow = next(s for s in damaged['Resources']['FrontendBucketPolicy']['Properties']['PolicyDocument']['Statement'] if s['Effect'] == 'Allow')
                allow[field] = replacement
                self.check(damaged, 19, 'bootstrap')
        damaged = copy.deepcopy(data)
        damaged['Resources']['ArtifactsBucketPolicy']['Properties']['PolicyDocument']['Statement'].append({
            'Effect': 'Allow', 'Principal': '*', 'Action': 's3:GetObject', 'Resource': '*'})
        self.check(damaged, 19, 'bootstrap')


class SpaRouting(unittest.TestCase):
    def test_embedded_function_rewrites_only_app_routes(self):
        data = template('bootstrap')
        self.assertIn('SpaRewriteFunction', data['Resources'], 'The deployed SPA request function is required')
        code = data['Resources']['SpaRewriteFunction']['Properties']['FunctionCode']
        cases = [
            ('/', 'GET', '/index.html'), ('/login', 'GET', '/index.html'),
            ('/register', 'HEAD', '/index.html'), ('/staff/reports', 'GET', '/index.html'),
            ('/guides/new/', 'GET', '/index.html'), ('/unknown-app-route', 'GET', '/index.html'),
            ('/index.html', 'GET', '/index.html'), ('/assets/app-123.js', 'GET', '/assets/app-123.js'),
            ('/assets/missing', 'GET', '/assets/missing'), ('/images/entrance.svg', 'GET', '/images/entrance.svg'),
            ('/favicon.ico', 'GET', '/favicon.ico'), ('/api', 'GET', '/api'),
            ('/api/bookings', 'GET', '/api/bookings'), ('/.well-known/config', 'GET', '/.well-known/config'),
            ('/asset%2Ejs', 'GET', '/asset%2Ejs'), ('/%61pi/test', 'GET', '/%61pi/test'),
            ('/bad%escape', 'GET', '/bad%escape'), ('/login', 'POST', '/login'),
        ]
        runner = r"""
const fs = require('fs');
const vm = require('vm');
const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
const context = vm.createContext({});
vm.runInContext(payload.code, context);
const results = payload.cases.map(([uri, method]) => {
  const request = {uri, method, querystring: {facility: {value: 'room-01'}}, headers: {host: {value: 'example.cloudfront.net'}}};
  const result = context.handler({request});
  return {uri: result.uri, method: result.method, querystring: result.querystring, headers: result.headers};
});
process.stdout.write(JSON.stringify(results));
"""
        result = subprocess.run(['node', '-e', runner], input=json.dumps({'code': code, 'cases': cases}),
                                capture_output=True, text=True, check=True)
        values = json.loads(result.stdout)
        for (original, method, expected), value in zip(cases, values):
            with self.subTest(uri=original, method=method):
                self.assertEqual(value['uri'], expected)
                self.assertEqual(value['method'], method)
                self.assertEqual(value['querystring'], {'facility': {'value': 'room-01'}})
                self.assertEqual(value['headers'], {'host': {'value': 'example.cloudfront.net'}})


if __name__ == '__main__':
    unittest.main()
