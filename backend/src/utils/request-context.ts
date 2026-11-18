import { AsyncLocalStorage } from "async_hooks";

export interface RequestContext {
	url: string;
	method: string;
}

export const requestContextStore = new AsyncLocalStorage<RequestContext>();
