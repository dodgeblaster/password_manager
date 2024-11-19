import { setExistingPassword, setEncryptionKey } from './passwordManager.mjs';
import { createInterface } from 'readline';
import crypto from 'crypto';

const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
});

function hideInput(query) {
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

function askVisible(query) {
    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            resolve(answer);
        });
    });
}

async function main() {
    try {
        const encryptionKey = await hideInput(
            'Please enter the ENCRYPTION_KEY: '
        );
        setEncryptionKey(encryptionKey);

        const service = await askVisible('Please enter the Service: ');
        const password = await hideInput('Please enter the Password: ');

        await setExistingPassword(service, password);
        console.log(`Password for ${service} has been set successfully.`);
    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        rl.close();
    }
}

main();
