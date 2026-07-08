# IAM plumbing that lets the EC2 box authenticate to AWS services as *itself* —
# no access keys on disk. Two-part pattern:
#
#   role     — an identity the box can "become." It has a TRUST policy (who may
#              assume it — here, the EC2 service) and, later, PERMISSIONS policies
#              (what it may do — SSM read in inc. 2, ECR pull in inc. 3). No
#              permissions are attached yet; this increment only stands up the
#              identity so nothing new is granted.
#   profile  — the attachment wrapper. An instance can't reference a role
#              directly; it references an instance profile, which holds the role.
#
# At runtime the box reads temporary, auto-rotating credentials for this role off
# the instance metadata service. That is the whole point: creds never touch state,
# env files, or user_data.

# Trust policy: only the EC2 service may assume this role. jsonencode() keeps the
# policy as native HCL (typo-checked, diffable) instead of a raw JSON string.
resource "aws_iam_role" "app" {
  name = "${var.project}-ec2"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = {
    Name    = "${var.project}-ec2"
    Project = var.project
  }
}

# The instance profile is the object EC2 actually attaches. It exists solely to
# carry the role onto the instance.
resource "aws_iam_instance_profile" "app" {
  name = "${var.project}-ec2"
  role = aws_iam_role.app.name

  tags = {
    Name    = "${var.project}-ec2"
    Project = var.project
  }
}

# --- Permission: read the MONGO_URI secret from SSM Parameter Store ---------
#
# The SecureString parameter itself is created OUT-OF-BAND (see README Setup →
# Secrets) so its plaintext value never lands in Terraform state. Terraform only
# grants the role permission to READ that one parameter.
#
# We build the parameter's ARN by hand rather than with a `data "aws_ssm_parameter"`
# source on purpose: that data source would fetch (and decrypt) the value into
# state — exactly what we're avoiding. account_id comes from the caller identity;
# region from var.region; the name from the variable.
data "aws_caller_identity" "current" {}

# The AWS-managed key that encrypts SSM SecureStrings by default. Reading the
# parameter WITH decryption requires kms:Decrypt on this key — GetParameter alone
# is not enough for a SecureString. Looking the alias up gives us its key ARN.
data "aws_kms_alias" "ssm" {
  name = "alias/aws/ssm"
}

# Inline policy (bound to this role, not reusable) — least privilege on two axes:
#   - only Get* on the ONE parameter's ARN (not ssm:* , not a wildcard path)
#   - kms:Decrypt only on the SSM key, and only when used VIA the SSM service
#     (the ViaService condition blocks using the key for anything but SSM reads)
resource "aws_iam_role_policy" "app_ssm_read" {
  name = "${var.project}-ssm-read"
  role = aws_iam_role.app.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadMongoUriParameter"
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
        ]
        Resource = "arn:aws:ssm:${var.region}:${data.aws_caller_identity.current.account_id}:parameter${var.mongo_uri_ssm_parameter_name}"
      },
      {
        Sid      = "DecryptWithSsmKey"
        Effect   = "Allow"
        Action   = "kms:Decrypt"
        Resource = data.aws_kms_alias.ssm.target_key_arn
        Condition = {
          StringEquals = {
            "kms:ViaService" = "ssm.${var.region}.amazonaws.com"
          }
        }
      },
    ]
  })
}
