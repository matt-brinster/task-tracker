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
