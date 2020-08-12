/**
 * Keeps track of the number of generator functions that have been profiled. A generator function is considered
 * profiled if next() has been invoked at least once.
 */
let profiledGenerators = 0;

/**
 * Adds profiling capabilities to the provided generator.
 *
 * The following events will be measured using the Performance interface:
 * - time from the the first call to next() until completion of the first call
 * - time since the completion of the previous next() call to the completion of the current call
 * - time from the first call of next() until the completion of a next() call with done: true
 *
 * @param {generator} a generator function
 * @param {performance} the Performance interface (https://developer.mozilla.org/en-US/docs/Web/API/Performance)
 * @returns {profiledGenerator} a wrapper that adds profiling capabilities to the provided generator
 */
export function profile(generator, performance) {
    return function* profiledGenerator(...args) {
        const generatorId = profiledGenerators++;
        const generatorStartMark = `gen${generatorId}-start`;
        const generatorMeasureName = `${generator.name}(#${generatorId})`;
        performance.mark(generatorStartMark);
        try {
            const iterator = generator(...args);
            let nextId = 0;
            let result;
            while ( true ) {
                const nextStartMark = `gen${generatorId}-next${nextId}-start`;
                try {
                    performance.mark(nextStartMark);
                    if (result) {
                        result = iterator.next(yield result.value);
                    } else {
                        result = iterator.next();
                    }
                    if (result.done) {
                        return;
                    }
                } finally {
                    const nextEndMark = `gen${generatorId}-next${nextId}-end`;
                    const nextMeasureName = `${generatorMeasureName}.next(#${nextId})`;
                    performance.mark(nextEndMark);
                    performance.measure(nextMeasureName, nextStartMark, nextEndMark);
                }
                nextId++;
            }
        } finally {
            const generatorEndMark = `gen${generatorId}-end`;
            performance.mark(generatorEndMark);
            performance.measure(generatorMeasureName, generatorStartMark, generatorEndMark);
        }
    }
}

/**
 * Resets the number of generator functions that have been profiled back to zero. This method is intended to improve
 * the isolation of test cases.
 */
export function resetCounter() {
    profiledGenerators = 0
}