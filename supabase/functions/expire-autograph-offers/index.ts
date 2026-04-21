import { expireOffersAndNotify, handleRequest, json, requireUser } from '../_shared/utils.ts';

Deno.serve((req) =>
  handleRequest(async (request) => {
    await requireUser(request);
    await expireOffersAndNotify();
    return json({ ok: true });
  }, req)
);
