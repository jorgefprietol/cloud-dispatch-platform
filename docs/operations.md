# Operación y recuperación

## Señales y diagnóstico

`/health/live` verifica que el proceso de API responde. `/health/ready` verifica PostgreSQL. Nginx reenvía readiness y el ALB usa ese estado; el worker expone actuator dentro de la red. La degradación de SQS se detecta por edad de mensajes y logs, no por la readiness de API.

| Síntoma | Revisar | Acción |
|---|---|---|
| Pedido en proceso sin avanzar | Outbox, logs API, profundidad y edad SQS | Recuperar conexión/permisos; el publicador reintenta con backoff hasta 300 segundos |
| Mensajes en DLQ de despacho | Logs Java y contrato `version=1` | Corregir causa, validar un mensaje y usar redrive controlado |
| Pedido despachado sin auditoría | Logs Lambda y DLQ de auditoría | Revisar permisos tabla/KMS y payload; redrive después de corregir |
| Indicadores retrasados | Redis y TTL | Consultar pedido individual; caché es eventual y no bloquea persistencia |
| Readiness 503 | Conexión RDS/PostgreSQL y logs de inicio | Revisar secret, DNS, security group y certificado RDS |
| Fallo de inicio de sesión | Callback, cliente, MFA y issuer Cognito | Verificar configuración pública y flujo administrado |

Los reportes contienen cliente indirectamente por pedido y destino. No publicar buckets ni logs con payloads completos. Java registra messageId, la API eventId y Lambda identificadores de fallo.

## Reintentos y recuperación de colas

SQS mantiene visibilidad durante 120 segundos. El worker procesa un mensaje por poll, limita las llamadas AWS a 20 segundos y el callback a 15; elimina el mensaje después del flujo completo. Tras cinco recepciones fallidas, SQS mueve el mensaje a DLQ. Una caída después de la confirmación puede repetir el reporte o SNS; el consumidor debe conservar la idempotencia.

No purgar una cola para resolver un fallo. Conservar el mensaje, identificar la causa y restaurar el flujo. Para un redrive AWS, obtener los ARN de DLQ y cola de destino en la consola o CLI y usar `aws sqs start-message-move-task --source-arn DLQ_ARN`. Ejecutarlo solo después de corregir la causa; respetar capacidad y consultar el progreso del move task.

## Backups y continuidad

La configuración incluye RDS Multi-AZ con backups por siete días, AWS Backup diario, S3 versionado, DynamoDB PITR y repositorios retenidos. Multi-AZ cubre fallos de instancia/zona y no reemplaza un backup contra eliminación lógica. El diseño actual permanece en una región; no tolera por sí solo un incidente regional completo.

Para un drill, restaurar RDS en una instancia nueva, conectar un entorno aislado, comprobar integridad de pedidos/outbox y evitar republicar eventos ya completados en el entorno original. Restaurar objetos por versionId y DynamoDB a una tabla nueva. Medir tiempo de recuperación y pérdida de datos; registrar los valores observados sin asumir cifras no probadas.

Antes de ampliar a otra región, definir RPO/RTO de negocio, replicación S3, copia de backups, dependencias Cognito/Secrets y estrategia de DNS. La conmutación debe coordinar escritura única y drenaje de colas para impedir dobles despachos.

## Releases y mantenimiento

Cada release usa el SHA de un commit validado. ECS usa circuit breaker con rollback si las tareas no alcanzan estado estable. Para volver a una versión anterior ejecutar Deploy AWS con su SHA exitoso. Mantener compatibilidad de eventos y esquema entre ambas versiones.

Dependabot mantiene dependencias y acciones. Revisar hallazgos de ECR, actualización de imágenes base y rotación de secretos. Las imágenes Lambda usan el usuario restringido administrado por su runtime; los otros contenedores declaran usuario sin privilegios.

La rotación del secreto worker debe sincronizar API y worker. Las tareas reciben los secretos al arrancar y necesitan un nuevo deployment. Los recursos RETAIN y deletion protection requieren un procedimiento de baja explícito; `cdk destroy` no garantiza detener todos los costes.
