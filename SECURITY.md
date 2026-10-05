# Seguridad

No registrar tokens, contraseñas o credenciales AWS en issues públicos. Para reportar un problema, usar el canal privado de seguridad del repositorio cuando esté disponible.

El modo local utiliza una identidad de desarrollo, credenciales exclusivamente locales y LocalStack. La API rechaza un inicio de producción sin autoridad Cognito y secreto worker fuerte. `.env` y artefactos de compilación están excluidos del repositorio.

En AWS se exige HTTPS externo, validación JWT, MFA, PKCE, RDS TLS, Redis TLS, cifrado KMS y permisos por servicio. El secreto interno se compara en tiempo constante. La protección del environment GitHub y los permisos de bootstrap CDK deben revisarse en la cuenta de destino.

Actualizar dependencias, revisar ECR y evaluar controles de cuenta antes de exponer datos reales. Las pruebas sintetizadas no sustituyen pruebas de autorización multiusuario ni una revisión de seguridad del despliegue cloud.

## Dependencia incluida por AWS CDK

CDK 2.272.0 incluye `brace-expansion` 5.0.9 dentro de su tarball. npm no reemplaza ese componente mediante overrides. `infra` instala la versión oficial 5.0.12, fijada y verificada por el lockfile, y su `postinstall` copia esa implementación y licencia sobre el componente incluido.

`npm run audit` verifica la integridad oficial fijada en el lockfile, la versión, el inventario completo y los hashes SHA-256 de todos los archivos reparados, incluidos CommonJS, ESM y LICENSE. Acepta únicamente los tres avisos de metadata del componente reemplazado ([GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p)) y falla ante cualquier otro hallazgo. Los escáneres que solo examinan el tarball base pueden seguir mostrando esos avisos. No omitir scripts al instalar infraestructura. Eliminar esta reparación cuando una versión actualizada de CDK incluya el componente corregido y pase todas las verificaciones.

CI conserva el informe `infra-security-evidence` con ambas versiones (metadata del bundle y código instalado), la integridad de origen y los hashes de cada archivo. Las pruebas rechazan una reparación ausente, código CommonJS/ESM alterado, licencia alterada, archivos adicionales o una integridad de origen distinta. El `postinstall` también ejecuta esta verificación completa.

Las alertas GHSA-q2hr-2g5m-vwhr, GHSA-qhr7-859c-m2p7 y GHSA-6j4f-fj2g-mc7p sobre el bundle 5.0.9 pueden cerrarse con una justificación de código vulnerable no utilizado: la instalación y CI exigen los archivos oficiales de 5.0.12 antes de usar CDK. Esto no modifica el lockfile del tarball upstream ni desactiva Dependabot. Un advisory distinto o una reparación incorrecta siguen bloqueando CI. Al actualizar CDK, revisar el bundle y eliminar esta reparación cuando upstream publique la corrección.
