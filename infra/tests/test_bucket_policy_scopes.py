"""Regression coverage: adding frontend OAC must not broaden image/artifact access."""
import copy
import unittest

import test_policies
from test_policies import template


class BucketPolicyScopes(unittest.TestCase):
    check = test_policies.Policies.check

    def test_images_policy_rejects_a_specific_unrelated_account_grant(self):
        data = template('application')
        data['Resources']['ImagesBucketPolicy']['Properties']['PolicyDocument']['Statement'].append({
            'Sid': 'CrossAccountRead',
            'Effect': 'Allow',
            'Principal': {'AWS': 'arn:aws:iam::111122223333:root'},
            'Action': 's3:GetObject',
            'Resource': {'Fn::Sub': '${ImagesBucket.Arn}/*'},
        })
        self.check(data, 19)

    def test_images_policy_must_attach_to_images_bucket_and_cover_all_objects(self):
        original = template('application')
        for bucket in ['unrelated-existing-bucket', {'Ref': 'FacilitiesTable'}]:
            with self.subTest(bucket=bucket):
                data = copy.deepcopy(original)
                data['Resources']['ImagesBucketPolicy']['Properties']['Bucket'] = bucket
                self.check(data, 19)
        for resources in [[], [{'Fn::GetAtt': ['ImagesBucket', 'Arn']}],
                          [{'Fn::Sub': '${ImagesBucket.Arn}/temporary/*'}]]:
            with self.subTest(resources=resources):
                data = copy.deepcopy(original)
                data['Resources']['ImagesBucketPolicy']['Properties']['PolicyDocument']['Statement'][0]['Resource'] = resources
                self.check(data, 19)

    def test_images_policy_cannot_be_missing_or_have_the_wrong_type(self):
        data = template('application')
        del data['Resources']['ImagesBucketPolicy']
        self.check(data, 19)
        data = template('application')
        data['Resources']['ImagesBucketPolicy']['Type'] = 'AWS::S3::Bucket'
        self.check(data, 19)

    def test_artifact_policy_cannot_target_frontend_bucket_instead(self):
        data = template('bootstrap')
        data['Resources']['ArtifactsBucketPolicy']['Properties']['Bucket'] = {'Ref': 'FrontendBucket'}
        self.check(data, 19, 'bootstrap')


if __name__ == '__main__':
    unittest.main()
