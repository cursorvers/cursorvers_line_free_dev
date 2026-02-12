FROM denoland/deno:2.1.4

WORKDIR /app

COPY main.ts deno.json ./

RUN deno cache main.ts

CMD ["deno", "run", "--allow-net", "--allow-env", "main.ts"]
