import { createInterface } from 'readline';

const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
});

export function adkHidden(query) {
    return new Promise((resolve) => {
        process.stdout.write(query);
        let input = '';

        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');

        const onData = (char) => {
            char = char.toString();
            switch (char) {
                case '\n':
                case '\r':
                case '\u0004':
                    process.stdout.write('\n');
                    process.stdin.setRawMode(false);
                    process.stdin.removeListener('data', onData);
                    resolve(input);
                    break;
                case '\u0003': // Ctrl+C
                    process.exit();
                    break;
                case '\u007f': // Backspace
                    if (input.length > 0) {
                        input = input.slice(0, -1);
                        process.stdout.clearLine();
                        process.stdout.cursorTo(0);
                        process.stdout.write(
                            query +
                                Array.from({ length: input.length })
                                    .map((_) => '*')
                                    .join('')
                        );
                    }
                    break;
                default:
                    input += char;
                    process.stdout.clearLine();
                    process.stdout.cursorTo(0);
                    process.stdout.write(
                        query +
                            Array.from({
                                length: input.length,
                            })
                                .map((_) => '*')
                                .join('')
                    );
                    break;
            }
        };

        process.stdin.on('data', onData);
    });
}

export function askVisible(query) {
    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            resolve(answer);
        });
    });
}

export function closeRl() {
    rl.close();
}
