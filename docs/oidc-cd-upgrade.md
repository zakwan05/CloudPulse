# Optional upgrade: GitHub Actions OIDC deploy (no static AWS keys)

This guide shows how to deploy CloudPulse from GitHub Actions using **OpenID Connect (OIDC)** so GitHub never stores long-lived AWS access keys.

**Do not enable the deploy workflow until the IAM role trust policy and permissions below are configured in your AWS account.**

## Why OIDC

| Approach | Risk |
| --- | --- |
| Static `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in GitHub Secrets | Keys can leak; hard to rotate; often over-privileged |
| OIDC federation to an IAM role | Short-lived credentials; trust limited to **your repo** and **main** branch |

## 1. Create an IAM OIDC identity provider (once per account)

In AWS IAM → Identity providers → Add provider:

- Provider type: **OpenID Connect**
- Provider URL: `https://token.actions.githubusercontent.com`
- Audience: `sts.amazonaws.com`

Or with AWS CLI (replace nothing if this provider already exists):

```powershell
aws iam create-open-id-connect-provider `
  --url https://token.actions.githubusercontent.com `
  --client-id-list sts.amazonaws.com `
  --thumbprint-list ffffffffffffffffffffffffffffffffffffffff
```

> AWS documents that the thumbprint is ignored for this GitHub provider in many setups; follow current AWS IAM OIDC docs if the CLI rejects the call.

## 2. Create a least-privilege deploy role

Trust policy — **restrict to your repository and `main` only**. Replace `YOUR_GITHUB_ORG_OR_USER` and `cloudpulse` (or your repo name):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::YOUR_ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_GITHUB_ORG_OR_USER/cloudpulse:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

Permissions policy — start narrow and expand only if `sam deploy` reports missing actions. Typical SAM deploy needs CloudFormation, S3 (packaging bucket), IAM (role creation for the function), Lambda, Logs, and related `iam:PassRole` for the Lambda execution role:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudFormationDeploy",
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateChangeSet",
        "cloudformation:DescribeChangeSet",
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents",
        "cloudformation:ExecuteChangeSet",
        "cloudformation:GetTemplateSummary",
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DeleteStack",
        "cloudformation:ListStackResources"
      ],
      "Resource": "*"
    },
    {
      "Sid": "SamPackagingBucket",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket",
        "s3:GetBucketLocation",
        "s3:GetBucketPolicy",
        "s3:PutBucketPolicy",
        "s3:PutBucketVersioning",
        "s3:PutBucketTagging",
        "s3:PutEncryptionConfiguration",
        "s3:PutLifecycleConfiguration",
        "s3:PutBucketPublicAccessBlock"
      ],
      "Resource": "*"
    },
    {
      "Sid": "LambdaAndLogs",
      "Effect": "Allow",
      "Action": [
        "lambda:*",
        "logs:CreateLogGroup",
        "logs:DeleteLogGroup",
        "logs:DescribeLogGroups",
        "logs:PutRetentionPolicy",
        "logs:TagResource",
        "logs:UntagResource",
        "logs:DeleteRetentionPolicy"
      ],
      "Resource": "*"
    },
    {
      "Sid": "IamForLambdaExecutionRole",
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:GetRole",
        "iam:PassRole",
        "iam:TagRole",
        "iam:UntagRole",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:GetRolePolicy"
      ],
      "Resource": "*"
    }
  ]
}
```

Tighten `Resource` ARNs to your stack name prefix and a dedicated SAM artifact bucket once you are comfortable. Never attach `AdministratorAccess` to the GitHub deploy role.

## 3. GitHub configuration

Repository → Settings → Secrets and variables → Actions → **Variables** (not long-lived keys):

| Variable | Example |
| --- | --- |
| `AWS_ROLE_ARN` | `arn:aws:iam::123456789012:role/cloudpulse-github-deploy` |
| `AWS_REGION` | `us-east-1` |

No `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` secrets.

## 4. Example deploy workflow (disabled until ready)

Copy [`.github/workflows/deploy.yml.example`](../.github/workflows/deploy.yml.example) to `.github/workflows/deploy.yml` **only after** the role trust and permissions work.

The example workflow:

- runs only on `push` to `main` (and optional `workflow_dispatch`)
- requests `id-token: write` for OIDC
- assumes your role with `aws-actions/configure-aws-credentials`
- runs `sam build` and `sam deploy`

## 5. Verify before merging CD

1. Run a manual `workflow_dispatch` (or a test push to `main` after enabling).
2. Confirm the job can assume the role (no `AccessDenied` on `AssumeRoleWithWebIdentity`).
3. Confirm stack update succeeds and `HealthFunctionUrl` output is present.
4. Call `GET /health` with `curl.exe`.

If assume-role fails, fix the trust `sub` condition (org/user, repo name, branch) before broadening permissions.
