FROM maven:3-eclipse-temurin-26@sha256:5bfb178bea156ab53b779b2be338e8bfb45decfed35d83da92f1dd9b7348845c AS build
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
