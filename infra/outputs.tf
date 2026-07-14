# Outputs surface computed values after apply (and feed other tooling) — here,
# confirmation of what was created and the IDs to reference elsewhere.
output "security_group_id" {
  description = "ID of the app security group."
  value       = aws_security_group.app.id
}

output "vpc_id" {
  description = "ID of the default VPC the security group is attached to."
  value       = data.aws_vpc.default.id
}

output "key_pair_name" {
  description = "Name of the EC2 key pair (referenced when launching the instance)."
  value       = aws_key_pair.deployer.key_name
}

output "instance_id" {
  description = "EC2 instance id."
  value       = aws_instance.app.id
}

output "instance_public_ip" {
  description = "Stable Elastic IP of the instance. SSH target and DNS A-record value."
  value       = aws_eip.app.public_ip
}

# sslip.io is wildcard DNS: <ip>.sslip.io resolves to that IP, with no account and
# no record to maintain. So the site's hostname is a pure function of the Elastic IP
# — derived here rather than written down, so it can't drift from reality.
#
# ⚠️ This is NOT wired into the Caddyfile, which hardcodes the same name (Caddy reads
# a static file fetched from the repo; Terraform never renders it). If the EIP ever
# changes, ../Caddyfile must be edited to match — this output is how you find the
# name it should hold.
output "site_host" {
  description = "Public hostname Caddy serves and requests a certificate for. Must match the site name in ../Caddyfile."
  value       = "${aws_eip.app.public_ip}.sslip.io"
}
