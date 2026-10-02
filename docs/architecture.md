# Diseño de Cloud Dispatch

## Responsabilidades

La API C# es la autoridad del ciclo de vida del pedido. Java se ocupa del despacho y conoce únicamente el contrato del evento y la confirmación HTTP. La función C# conserva los eventos completados en una base de auditoría separada. React ofrece una consola operativa; Nginx mantiene API y aplicación bajo el mismo origen.

El modelo evita que Java tenga credenciales de PostgreSQL. El endpoint de confirmación recibe tráfico exclusivamente de la red de servicios y exige un secreto fuerte, inyectado desde Secrets Manager. Nginx no publica `/internal/`.

## ADR-001: servicios complementarios en C# y Java

ASP.NET Core implementa validación, autenticación, transacciones y outbox. Spring Boot ofrece programación de consumo y SDK de AWS para el worker. Los dos lenguajes resuelven responsabilidades diferentes dentro de un producto funcional, con un contrato JSON versionado.

## ADR-002: React para la consola

React y TypeScript cubren formularios, filtros, actualización de estado y OIDC sin añadir otro backend. Un tercer servicio de negocio en Node.js duplicaría responsabilidades existentes. El frontend se configura al iniciar su contenedor, por lo que la misma imagen sirve para local y AWS.

## ADR-003: outbox y entrega al menos una vez

`POST /api/orders` inserta pedido y outbox en una sola transacción. La combinación `(owner_id, idempotency_key)` es única. La huella del payload identifica reintentos equivalentes y rechaza reutilizaciones con datos diferentes mediante 409.

El publicador toma filas con `FOR UPDATE SKIP LOCKED`, envía a SQS y marca la publicación. Si el envío fue aceptado pero la transacción se revierte, el evento reaparece. Java genera el mismo tracking y la misma clave S3; la confirmación tolera el replay. Solo elimina el mensaje después de completar reporte, confirmación y notificación cuando está configurada.

La concurrencia del publicador es una transacción por réplica. Cada réplica intenta un evento por segundo; este valor es deliberadamente conservador. Para mayor volumen, medir primero y reemplazarlo por lotes con leases y límites de concurrencia. El esquema inicial usa un advisory lock para impedir carreras de migración entre réplicas; futuras migraciones destructivas necesitan pasos explícitos compatibles con despliegues progresivos.

## ADR-004: PostgreSQL y Redis

PostgreSQL mantiene pedidos, idempotencia y outbox con integridad transaccional. Redis almacena únicamente indicadores durante 10 segundos y su caída no debe impedir operaciones. Los datos del usuario se filtran por `sub` de Cognito; no se confía en identificadores de usuario suministrados por el navegador.

La invalidación de caché es best effort. Una lectura concurrente podría repoblar una versión anterior después de una actualización; el TTL limita la antigüedad. Para decisiones críticas se debe consultar el pedido, no el indicador agregado.

## ADR-005: auditoría serverless

SNS distribuye los eventos completados a una cola propia. Lambda C# escribe en DynamoDB mediante una condición de no existencia y devuelve fallos parciales por lote. La clave compuesta pedido/evento evita duplicados; TTL mantiene una retención de 365 días y PITR permite recuperación. El archivo de auditoría puede retrasarse respecto a la confirmación operativa.

El reporte y el registro de auditoría describen un despacho gestionado por software. La integración con transportistas reales, cálculo de tarifas y confirmación física de entrega quedan fuera del contrato actual.

## ADR-006: ECS y despliegue AWS

Fargate evita administrar nodos para tres servicios de larga duración. Los contenedores tienen usuarios sin privilegios y logs estructurados. Cada task role accede solo a sus colas, bucket o tópico. Lambda usa su propio rol para cola y tabla. Los datos permanecen en subredes aisladas; los servicios en privadas; el ALB en públicas.

Se crean dos NAT Gateways para mantener salida por zona. S3 usa un gateway endpoint. Los endpoints de interfaz no se activan por defecto porque agregan coste fijo; pueden sustituir la salida NAT cuando el perfil de tráfico lo justifique.

Nginx resuelve el upstream periódicamente mediante el DNS de Docker o el resolver de VPC. Esto permite seguir los cambios de IP de las tareas API durante sustituciones y despliegues. El orden de creación de los servicios web y worker depende del servicio API.

RDS, reportes, tabla, backups, clave KMS y repositorios se retienen. Eliminar el stack no elimina esos recursos. El rol GitHub confía únicamente en el environment `production`; los roles de aplicación no comparten ese permiso. El rol CDK de despliegue posee poder de infraestructura mediante los roles bootstrap y exige protección del environment.
