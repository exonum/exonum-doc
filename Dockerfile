FROM python:2.7-slim AS builder
WORKDIR /app
COPY requirements.lock /tmp/
RUN pip install -r /tmp/requirements.lock
COPY . /app
RUN python -m mkdocs build

FROM nginx:stable-alpine
# Disable absolute redirects, which don't work because of possible discrepancy
# between host and container ports
RUN sed -i -r -e '3 i absolute_redirect off;' /etc/nginx/conf.d/default.conf
COPY --from=builder /app/site /usr/share/nginx/html
