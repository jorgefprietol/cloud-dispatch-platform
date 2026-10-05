FROM maven:3.9-eclipse-temurin-26@sha256:b2c1ad85954592f9928e84327c65201f308ad9b5d8ed7d5b823717c97bf23fbb AS build
WORKDIR /src
COPY services/dispatch-worker/pom.xml ./
RUN mvn -B dependency:go-offline
COPY services/dispatch-worker/src ./src
RUN mvn -B verify
FROM eclipse-temurin:25-jre-alpine@sha256:3c0a9084927a221ccd1d007fcaf614465672c0af37aaa834c5184483afe56d61
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build /src/target/dispatch-worker-1.0.0.jar app.jar
USER app
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=65.0"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
