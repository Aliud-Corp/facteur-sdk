/** The names of the tasks the browser half calls. Their own file: the browser half must not import the plugin, which imports the SDK. */
export const TASKS = {
    inbox: 'facteur:inbox',
    waitFor: 'facteur:waitFor',
    messages: 'facteur:messages',
    purge: 'facteur:purge',
} as const
