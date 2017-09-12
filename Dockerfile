FROM python:2.7-slim
WORKDIR /app

COPY requirements.lock /tmp/
RUN pip install -r /tmp/requirements.lock

COPY . /app

EXPOSE 8000
CMD ["python", "-m", "mkdocs", "serve", "--no-livereload", "-a", "0.0.0.0:8000"]
