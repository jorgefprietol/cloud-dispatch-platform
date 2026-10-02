FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
COPY services/dispatch-worker/pom.xml ./
RUN mvn -B dependency:go-offline
COPY services/dispatch-worker/src ./src
RUN mvn -B verify
FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build /src/target/dispatch-worker-1.0.0.jar app.jar
USER app
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=65.0"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
