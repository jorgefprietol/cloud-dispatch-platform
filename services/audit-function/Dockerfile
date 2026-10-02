FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY services/audit-function/Audit.Function.csproj services/audit-function/packages.lock.json ./
RUN dotnet restore --locked-mode
COPY services/audit-function/ ./
RUN dotnet publish -c Release --no-restore -o /app
FROM public.ecr.aws/lambda/dotnet:10
COPY --from=build /app ${LAMBDA_TASK_ROOT}
CMD ["Audit.Function::CloudDispatch.Audit.Function::Handler"]
