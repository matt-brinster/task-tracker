# Outputs surface computed values after apply (and feed other tooling). For
# increment 1 these just confirm the SG was created and attached to the VPC.
output "security_group_id" {
  description = "ID of the app security group."
  value       = aws_security_group.app.id
}

output "vpc_id" {
  description = "ID of the default VPC the security group is attached to."
  value       = data.aws_vpc.default.id
}
