FROM maven:3.9-eclipse-temurin-26@sha256:b2c1ad85954592f9928e84327c65201f308ad9b5d8ed7d5b823717c97bf23fbb AS maven_distribution
# Copy Maven tools only; the JDK bundled with their source image is never executed.
FROM eclipse-temurin:25-jdk-noble@sha256:589ff4cc3f71aab462e7048a47a0d10edf57fbccde3fceea2281e610bf5880b4 AS build
COPY --from=maven_distribution /usr/share/maven /usr/share/maven
ENV MAVEN_HOME="/usr/share/maven" PATH="/usr/share/maven/bin:${PATH}"
RUN java -version 2>&1 | grep -E 'version "25[.]' && mvn -version
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
