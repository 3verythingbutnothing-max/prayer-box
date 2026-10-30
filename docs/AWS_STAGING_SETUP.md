# AWS staging setup and verification

October 30, 2026. The founder has created the AWS account. The signed-in console showed a Free plan, $100 in credits, and an April 30, 2027 expiry (or earlier credit depletion). Root passkey MFA was verified after founder enrollment. No root access keys were created or exported.

## Prepared configuration

The checked-in [Cognito template](../backend/provision/cognito-staging.json) defines exactly two resources:

- `prayer-box-staging`: Cognito Lite, username accounts with no required contact attributes, no aliases, public signup disabled, app-managed recovery, 15-character minimum password policy, optional authenticator MFA, deletion protection and retained pool data.
- `prayer-box-staging-server`: app client without a secret, IAM-authorized `ADMIN_USER_PASSWORD_AUTH` only, existence-error protection, token revocation and short token lifetimes. No managed-login domain, OAuth redirects or public password/refresh flows are configured.

The template creates no users, IAM permissions, access keys, SMS roles, Lambda functions, hosting, email integration, payments or public app deployment. Optional pool MFA prepares for privileged TOTP; it does not implement or certify the application's MFA challenge handling. Privileged basic sessions remain denied.

AWS CloudFormation validated the template. A change set named `initial-directory` on `prayer-box-cognito-staging` in `us-east-2` was prepared and described as `CREATE_COMPLETE` / `AVAILABLE`, with two `Add` actions. **A prepared change set is not an applied directory.** The account's root console session is being used only for initial bootstrap; routine operations must move to scoped access.

## Apply only after the concrete setup is approved

Use AWS's built-in CloudShell; no local AWS installation or root credential export is necessary for this bootstrap. The JSON file is nonsecret. Keep the directory and stack names stable after an uncertain response; inspect state before retrying.

```sh
aws cloudformation describe-change-set --region us-east-2 \
  --stack-name prayer-box-cognito-staging --change-set-name initial-directory \
  --output json --no-cli-pager

# Only after approval of the displayed change set:
aws cloudformation execute-change-set --region us-east-2 \
  --stack-name prayer-box-cognito-staging --change-set-name initial-directory \
  --client-request-token prayerbox-staging-apply-20261030

aws cloudformation describe-stacks --region us-east-2 \
  --stack-name prayer-box-cognito-staging \
  --query 'Stacks[0].{Status:StackStatus,Outputs:Outputs}' \
  --output json --no-cli-pager
```

Verify the deployed pool's tier, required attributes, public-signup denial, recovery policy, password policy and MFA configuration through `DescribeUserPool`/`GetUserPoolMfaConfig`. Verify **all** app clients with `ListUserPoolClients`/`DescribeUserPoolClient`; confirm there is no unintended client or hosted domain. A template validation or successful stack record does not replace those checks.

Pool ID, pool ARN, region and client ID are nonsecret identifiers. Keep credentials out of the template, source control, screenshots, chat and logs. If a create is interrupted or fails, inspect CloudFormation events and retained resources before doing anything else; never automatically delete the directory or create duplicate pools.

## Spending alerts

A $10 monthly AWS-usage budget is proposed, covering all AWS services and measuring usage before credits/refunds. The monthly template alerts on actual costs at 85% ($8.50), actual costs at 100% ($10), and a 100% forecast. Sending to the account's existing owner email requires founder consent; the recipient is not stored in source control. This is an alert threshold, not a hard limit, paid-plan upgrade or spending authorization. Billing data can take up to 24 hours to appear for a new account. Budget creation and email receipt must be verified separately.

## Still required before real registration

Grant only the five documented runtime Cognito actions against the single staging pool ARN. Provisioning permissions stay outside the runtime identity; do not grant `AdministratorAccess`, wildcard-pool access or root credentials to Cloudflare. Prefer temporary scoped credentials; any credential setup must use a secure local/managed-secret flow rather than chat.

Then run isolated live-provider proof, including username-only creation, no messages, direct public-signup/auth rejection, password boundaries, duplicate/interrupted mutations, recovery and provider/local session revocation. Use only authorized synthetic accounts. Complete staff MFA, reconciliation, support and the wider [pilot gates](WEB_PILOT_EXECUTION.md) before opening registration. All checked-in authentication capability flags remain off.

Sources: [Cognito user-pool resource](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cognito-userpool.html), [app-client resource](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cognito-userpoolclient.html), [public-signup policy](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-admin-create-user-policy.html), [CloudShell](https://docs.aws.amazon.com/cloudshell/latest/userguide/getting-started.html), [budget templates](https://docs.aws.amazon.com/cost-management/latest/userguide/budget-templates.html).
