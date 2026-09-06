locals {
  app_ip = var.allocate_elastic_ip ? aws_eip.app[0].public_ip : aws_instance.app.public_ip
}

output "app_public_ip" {
  description = "DNS A 레코드 대상. 앱은 deploy-app.sh 실행 전에는 기동하지 않는다."
  value       = local.app_ip
}

output "app_instance_id" {
  value = aws_instance.app.id
}

output "backup_s3_bucket" {
  value = aws_s3_bucket.backups.bucket
}

output "ssm_command" {
  value = "aws ssm start-session --region ${var.aws_region} --target ${aws_instance.app.id}"
}

output "next_steps" {
  value = <<-EOT
    1. SSM 접속: aws ssm start-session --region ${var.aws_region} --target ${aws_instance.app.id}
    2. 도메인 DNS A 레코드를 ${local.app_ip}로 연결한다.
    3. /opt/msp-weekly-review에서 README의 환경변수를 설정하고 bash scripts/deploy-app.sh 실행.
    4. Slack Redirect URL에 https://<도메인>/auth/slack/callback 등록 후 로그인 확인.
    5. BACKUP_S3_BUCKET=${aws_s3_bucket.backups.bucket}로 백업 시험 및 systemd timer 설치.
  EOT
}
