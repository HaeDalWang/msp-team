output "app_public_ip" {
  description = "애플리케이션 접속 주소. http://<이 값> 으로 접속한다."
  value       = aws_instance.app.public_ip
}

output "backup_s3_bucket" {
  description = "pg_dump 백업이 저장되는 S3 버킷 이름. scripts/backup.sh, scripts/restore.sh 실행 시 BACKUP_S3_BUCKET으로 사용."
  value       = aws_s3_bucket.backups.bucket
}

output "ssh_command" {
  description = "ssh_key_name을 지정한 경우 EC2 접속 명령"
  value       = var.ssh_key_name != "" ? "ssh -i <키페어.pem> ec2-user@${aws_instance.app.public_ip}" : "ssh_key_name 변수가 비어 있어 SSH 접속 불가 (AWS 콘솔의 EC2 Instance Connect 사용)"
}

output "next_steps" {
  description = "apply 이후 사람이 직접 해야 하는 작업"
  value       = <<-EOT
    1. Slack App 설정 > OAuth & Permissions > Redirect URLs에 다음을 등록:
       http://${aws_instance.app.public_ip}/auth/slack/callback
    2. 앱이 실제로 뜨는지 확인: curl http://${aws_instance.app.public_ip}/health
    3. 백업 시험: BACKUP_S3_BUCKET=${aws_s3_bucket.backups.bucket} scripts/backup.sh
  EOT
}
