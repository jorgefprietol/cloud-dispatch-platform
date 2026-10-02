# Capacidades y selección de servicios

El diseño agrupa capacidades cloud por problema operativo. La columna de estado distingue recursos implementados de alternativas evaluadas; no implica que se hayan desplegado o validado en AWS.

| Capacidad | Implementación actual | Alternativas y criterio de selección |
|---|---|---|
| Identidad y permisos | IAM por task, GitHub OIDC, Cognito con MFA y PKCE | IAM Identity Center para operadores administrativos; MFA y roles temporales para la cuenta |
| Regiones y zonas | VPC con dos AZ y servicios distribuidos | Segunda región cuando los objetivos de continuidad exijan tolerar un fallo regional |
| Cómputo | ECS Fargate para API, worker y web | EC2/ASG para control del host o cargas estables con optimización de reserva; Spot para procesamiento tolerante a interrupciones |
| Balanceo | ALB HTTPS, ACM y circuit breaker ECS | NLB para TCP/UDP o IP estática; GWLB para appliances de inspección |
| Escalado | Políticas por CPU con mínimo 2 y máximo 6 tareas | Ajustar el worker por backlog SQS tras medir tiempo de procesamiento y límites downstream |
| Almacenamiento de bloque | RDS administra su almacenamiento y autoscaling | EBS cifrado para EC2; snapshots para recuperación; instance store solo para datos temporales |
| Archivos compartidos | No requerido por el flujo de reportes | EFS cuando varias tareas necesiten POSIX; S3 para objetos sin filesystem compartido |
| Base transaccional | RDS PostgreSQL Multi-AZ, backup y TLS | Aurora para mayor necesidad de lectura, disponibilidad o escalado; read replicas para consultas, no como equivalente de Multi-AZ |
| Caché | ElastiCache Redis con TLS, autenticación y failover | Caché local por instancia para datos pequeños sin coordinación |
| Base serverless | DynamoDB on-demand, KMS, TTL y PITR para auditoría | DocumentDB para acceso documental compatible; Neptune para grafos; Keyspaces para patrones Cassandra; Timestream para series temporales |
| Objetos | S3 privado, KMS, versionado y lifecycle | Replicación entre regiones como extensión de DR; presigned URLs si los reportes crecen más allá de la descarga por API |
| DNS | Route 53 alias al ALB | Latency/weighted/failover solo cuando existan endpoints de múltiples regiones; Resolver para redes híbridas |
| Distribución global | Frontend servido por Nginx detrás de ALB | CloudFront + S3 para assets globales; requiere separar API, CORS y dominios |
| Integración | SQS, DLQ y SNS; contratos versionados | EventBridge para integración por reglas; Amazon MQ para protocolos existentes; Kinesis/MSK para streams y replay extenso |
| Serverless | Lambda C# procesa auditoría desde SQS | API Gateway para APIs serverless; Step Functions para flujos con varios pasos y compensación |
| Contenedores | ECR inmutable, ECS Fargate, GHCR y SBOM | EKS cuando se requieran extensiones Kubernetes; App Runner para servicios HTTP más simples |
| Cifrado y secretos | KMS con rotación, Secrets Manager, TLS | SSM Parameter Store para configuración no secreta o secretos con requisitos distintos de rotación |
| Protección de aplicación | WAF con reglas administradas y rate limit; validación y límites de request | Shield Advanced y Firewall Manager para requisitos de protección o administración centralizada |
| Observabilidad | CloudWatch Logs, Container Insights y alarmas operativas | Trazas distribuidas OpenTelemetry/X-Ray requieren instrumentación adicional; no se declara implementada |
| Auditoría cloud | CloudTrail multi-región y eventos de escritura S3 | AWS Config para conformidad; GuardDuty, Inspector y Macie como activaciones de seguridad de cuenta |
| Recuperación | RDS backups y AWS Backup; datos y repositorios RETAIN | Copias entre regiones, restore drills, DMS y Application Migration Service según origen y RPO/RTO |
| Infraestructura | CDK produce CloudFormation reproducible | Terraform cuando el equipo estandarice esa herramienta |
| Coste | Tags, lifecycle y alerta mensual opcional | Budgets no detiene gasto; revisar Cost Explorer y ajustar capacidad según métricas |
| Analítica | Reportes operativos y archivo de auditoría | Athena/Glue/Lake Formation para lake; Redshift para warehouse; EMR para procesamiento distribuido; OpenSearch para búsquedas; QuickSight para BI |
| Inteligencia aplicada | Sin procesamiento ML en el flujo actual | Textract para documentos, Rekognition para imágenes, Transcribe/Polly para voz, Translate/Comprehend para lenguaje y SageMaker para modelos específicos |
| Operación administrativa | Task roles, logs y despliegues versionados | SSM Session Manager para EC2; Batch para trabajos; SES para envío transaccional; AppFlow para integraciones SaaS |

No todos estos servicios deben coexistir. Agregarlos sin una necesidad de negocio aumentaría permisos, costes y modos de fallo. Las alternativas de esta tabla no crean recursos y no se presentan como experiencia de operación cloud ya realizada.
