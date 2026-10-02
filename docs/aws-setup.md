# Preparación AWS

## Estado

El repositorio contiene código e infraestructura sintetizable. El despliegue requiere configurar una cuenta AWS; no se han provisionado recursos cloud. El stack de runtime es una configuración con alta disponibilidad y recursos con coste recurrente. Consultar AWS Pricing Calculator para la región elegida antes de ejecutarlo; el presupuesto es una alerta y no un límite de gasto.

## Datos necesarios

| Variable del environment GitHub `production` | Valor esperado |
|---|---|
| `AWS_REGION` | Región de los servicios y del certificado ACM |
| `AWS_ACCOUNT_ID` | Cuenta AWS de 12 dígitos |
| `AWS_ROLE_ARN` | Output `DeploymentRoleArn` del foundation |
| `APP_DOMAIN` | Nombre completo, por ejemplo `dispatch.example.com` |
| `CERTIFICATE_ARN` | Certificado ACM validado para ese dominio, en la misma región del ALB |
| `HOSTED_ZONE_ID` | Zona pública de Route 53 |
| `HOSTED_ZONE_NAME` | Dominio de la zona, por ejemplo `example.com` |
| `OIDC_PROVIDER_ARN` | Opcional: proveedor GitHub previamente existente en la cuenta |
| `ALERT_EMAIL` | Opcional: destinatario de alarmas SNS y presupuesto |

No crear access keys para GitHub. La autenticación del pipeline usa credenciales temporales por OIDC. Si `ALERT_EMAIL` se usa, confirmar las suscripciones recibidas antes de confiar en las alertas.

## Bootstrap inicial

Para revisar ambas plantillas sin credenciales, sintetizar con `-c offline=true -c runtime=true` y los parámetros de ejemplo de la validación CI. El modo offline fija una cuenta ficticia y zonas de prueba; nunca usarlo para desplegar. La librería CDK se fija a una versión validada cuyo árbol de dependencias supera la auditoría de seguridad.

Instalar AWS CLI y usar un perfil autorizado mediante IAM Identity Center o credenciales temporales. Sustituir los ejemplos por la cuenta y región reales.

```sh
aws sts get-caller-identity
cd infra
npm ci
npm run build
npm test
npx cdk bootstrap aws://ACCOUNT_ID/REGION
npx cdk deploy CloudDispatchFoundation --outputs-file foundation-outputs.json
```

Si existe `token.actions.githubusercontent.com`, añadir `-c oidcProviderArn=ARN_EXISTENTE` al deploy inicial y guardar ese mismo valor en `OIDC_PROVIDER_ARN`. Si CDK creó el proveedor, mantener esa variable vacía en los siguientes deploys para conservar su gestión en el mismo stack. La política de eliminación del proveedor es RETAIN.

El foundation crea cuatro repositorios ECR, una clave KMS y el rol de GitHub. No crea ECS, bases de datos ni balanceador. Crear o revisar el environment `production`, permitir despliegues desde `main` y configurar sus variables. Si cambia el propietario del repositorio, actualizar `repository` en `infra/cdk.json` antes del bootstrap: el subject de confianza OIDC incorpora ese nombre.

## Primer despliegue

1. Esperar a que **CI** finalice en `main`, incluyendo la publicación de las cuatro imágenes.
2. Copiar el SHA completo de ese commit.
3. Ejecutar **Deploy AWS** con `image_sha` igual a ese SHA.
4. El workflow verifica procedencia, autentica OIDC, copia las imágenes a ECR y despliega ambos stacks.
5. Revisar outputs, health check, alarmas, CloudWatch y DNS.

El mismo commit puede redesplegarse: ECR conserva tags inmutables y el workflow omite el push si ya existe el tag. Para rollback usar el SHA de una versión anterior cuyo CI sea exitoso. CDK puede modificar infraestructura además de imágenes; revisar el diff local antes de cambios de infraestructura:

```sh
npx cdk diff --all -c runtime=true \
  -c domain=dispatch.example.com -c zoneName=example.com -c zoneId=ZONE_ID \
  -c certificateArn=ACM_ARN -c imageTag=sha-COMMIT_SHA
```

Usar el mismo contexto OIDC del bootstrap si se importó un proveedor existente. El workflow despliega la infraestructura del SHA seleccionado, no la de otro checkout.

## Identidad y primer operador

El User Pool exige contraseña fuerte y MFA TOTP. El registro público está deshabilitado. Crear el operador con una identidad administrativa autorizada:

```sh
aws cognito-idp admin-create-user --user-pool-id USER_POOL_ID \
  --username operator@example.com \
  --user-attributes Name=email,Value=operator@example.com Name=email_verified,Value=true
```

Completar cambio de contraseña y enrolamiento TOTP en el inicio de sesión. Cognito usa el callback exacto `https://APP_DOMAIN/auth/callback`; el frontend usa Authorization Code + PKCE y envía el ID token con audiencia del cliente. La API verifica firma, issuer, audiencia, caducidad, `token_use=id` y subject.

La base de datos exige TLS con verificación completa; el contenedor de API incluye el bundle de CA oficial de RDS. Redis utiliza TLS y token de autenticación. Los secretos se inyectan en tareas; una rotación exige reiniciar las tareas afectadas de forma coordinada.

Las decisiones de validación siguen la [documentación de tokens Cognito](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html), y la conexión a PostgreSQL sigue la [verificación TLS de RDS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.SSL.html). La imagen de auditoría usa el [runtime .NET para Lambda en contenedores](https://docs.aws.amazon.com/lambda/latest/dg/csharp-image.html).

## Validación posterior

- Crear un pedido con un operador autenticado y descargar el reporte después del despacho.
- Confirmar que el registro llegue a DynamoDB y que las DLQ permanezcan vacías.
- Verificar que otra identidad no pueda leer el pedido ni descargar su reporte.
- Probar la terminación de una tarea, interrupción de caché y restauración de backup en un entorno aislado.
- Medir carga, latencia y objetivos de recuperación; documentar resultados antes de comprometer un SLA.

El smoke local utiliza identidad de desarrollo y no sustituye estas pruebas con Cognito. `cdk synth` y los assertions no comprueban permisos efectivos, disponibilidad de tipos de instancia ni integración del proveedor en una cuenta real.
