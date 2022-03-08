ARG BUILD_IMAGE=node:14-bullseye-slim
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs:14


# ---- BUILD ENV ---

FROM "${BUILD_IMAGE}" AS build-env

COPY . /app
WORKDIR /app

RUN npm install --only=production


# ---- FINAL IMAGE ---

FROM "${RUNTIME_IMAGE}"

COPY --from=build-env /app /app
WORKDIR /app

CMD ["main.js"]
