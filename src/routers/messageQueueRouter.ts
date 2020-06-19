import { CloudFunctionMessageQueueEventMessage, CloudFunctionTriggerEvent } from '../models/cloudFunctionEvent';
import { CustomMessageQueueValidator, MessageQueueRoute } from '../models/routes';
import { InvalidRequestError, NoMatchedRouteError } from '../models/routerError';

import { CloudFunctionContext } from '../models/cloudFunctionContext';
import { CloudFuntionResult } from '../models/cloudFunctionResult';
import { log } from '../helpers/log';
import { matchObjectPattern } from '../helpers/matchObjectPattern';

const validateQueueId = (queueIds: string[] | undefined, message: CloudFunctionMessageQueueEventMessage) => {
    if (queueIds) {
        return queueIds.some((queueId) => message.details.queue_id === queueId);
    } else {
        return true;
    }
};

const validateBodyJson = (pattern: object | undefined, message: CloudFunctionMessageQueueEventMessage) => {
    if (pattern) {
        try {
            const bodyObject = JSON.parse(message.details.message.body);
            return matchObjectPattern(bodyObject, pattern);
        } catch (e) {
            if (e instanceof SyntaxError) {
                return false;
            } else {
                throw e;
            }
        }
    } else {
        return true;
    }
};

const validateBodyPattern = (pattern: RegExp | undefined, message: CloudFunctionMessageQueueEventMessage) => {
    if (pattern) {
        if (message.details.message.body) {
            return pattern.test(message.details.message.body);
        } else {
            return false;
        }
    } else {
        return true;
    }
};

const validateWithValidators = (
    validators: CustomMessageQueueValidator[] | undefined,
    event: CloudFunctionTriggerEvent,
    context: CloudFunctionContext,
    message: CloudFunctionMessageQueueEventMessage
) => {
    try {
        return validators ? validators.every((validator) => validator(event, context, message)) : true;
    } catch (e) {
        log('WARN', context.requestId, `Validator failed with error: ${(e?.toString() ?? 'unknown error').replace(/[\r\n]+/g, '')}`, {});
        return false;
    }
};

const messageQueueRouter: (
    routes: MessageQueueRoute[],
    event: CloudFunctionTriggerEvent,
    message: CloudFunctionMessageQueueEventMessage,
    context: CloudFunctionContext
) => Promise<CloudFuntionResult> = async (routes, event, message, context) => {
    for (const { queueId, body, validators, handler } of routes) {
        const matched =
            validateQueueId(queueId, message) && validateBodyJson(body?.json, message) && validateBodyPattern(body?.pattern, message);

        if (matched) {
            const validatorsPassed = validateWithValidators(validators, event, context, message);

            if (validatorsPassed) {
                const result = handler(event, context, message);
                if (result instanceof Promise) {
                    return result;
                } else {
                    return Promise.resolve(result);
                }
            } else {
                log('WARN', context.requestId, 'Invalid request', {});
                throw new InvalidRequestError('Invalid request.');
            }
        }
    }

    log('WARN', context.requestId, 'There is no matched route', {});
    throw new NoMatchedRouteError('There is no matched route.');
};

export { messageQueueRouter };
