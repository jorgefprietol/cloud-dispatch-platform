# Seguridad

No registrar tokens, contraseñas o credenciales AWS en issues públicos. Para reportar un problema, usar el canal privado de seguridad del repositorio cuando esté disponible.

El modo local utiliza una identidad de desarrollo, credenciales exclusivamente locales y LocalStack. La API rechaza un inicio de producción sin autoridad Cognito y secreto worker fuerte. `.env` y artefactos de compilación están excluidos del repositorio.

En AWS se exige HTTPS externo, validación JWT, MFA, PKCE, RDS TLS, Redis TLS, cifrado KMS y permisos por servicio. El secreto interno se compara en tiempo constante. La protección del environment GitHub y los permisos de bootstrap CDK deben revisarse en la cuenta de destino.

Actualizar dependencias, revisar ECR y evaluar controles de cuenta antes de exponer datos reales. Las pruebas sintetizadas no sustituyen pruebas de autorización multiusuario ni una revisión de seguridad del despliegue cloud.
