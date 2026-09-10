import worker, { TexasAcquisitionWorkflow } from './index.js';
import { handleInternalSerperRequest, isInternalSerperRequest } from './internal-serper-broker.js';
import { handleInternalGithubPrRequest, isInternalGithubPrRequest } from './internal-github-pr-broker.js';
import { handleInternalGithubControllerRequest, isInternalGithubControllerRequest } from './internal-github-controller-broker.js';

export { TexasAcquisitionWorkflow };

export default {
  scheduled: worker.scheduled,

  async fetch(request, env, ctx) {
    if (isInternalSerperRequest(request)) return handleInternalSerperRequest(request, env);
    if (isInternalGithubPrRequest(request)) return handleInternalGithubPrRequest(request, env);
    if (isInternalGithubControllerRequest(request)) return handleInternalGithubControllerRequest(request, env);
    return worker.fetch(request, env, ctx);
  }
};
