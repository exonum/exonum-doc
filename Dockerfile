FROM python:2.7-slim AS builder
WORKDIR /app
COPY requirements.lock /tmp/
RUN pip install -r /tmp/requirements.lock
COPY . /app
RUN python -m mkdocs build

FROM nginx:stable-alpine
COPY --from=builder /app/site /usr/share/nginx/html
