import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';

const execAsync = promisify(exec);

const TABLE_NAME = process.env.DB;
let ENCRYPTION_KEY = '';

export function setEncryptionKey(key) {
    ENCRYPTION_KEY = key;
}

function deriveKey(key) {
    return crypto
        .createHash('sha256')
        .update(String(key))
        .digest('base64')
        .substr(0, 32);
}

function encrypt(text) {
    if (!ENCRYPTION_KEY) throw new Error('Encryption key not set');
    const iv = crypto.randomBytes(16);
    const key = deriveKey(ENCRYPTION_KEY);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    if (!ENCRYPTION_KEY) throw new Error('Encryption key not set');
    const key = deriveKey(ENCRYPTION_KEY);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

function generatePassword(options = {}) {
    const defaults = {
        length: 12,
        uppercase: true,
        lowercase: true,
        numbers: true,
        symbols: true,
        excludedChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
    };

    const config = { ...defaults, ...options };

    const uppercaseChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercaseChars = 'abcdefghijklmnopqrstuvwxyz';
    const numberChars = '0123456789';
    const symbolChars = '!@';

    let allowedChars = '';
    if (config.uppercase) allowedChars += uppercaseChars;
    if (config.lowercase) allowedChars += lowercaseChars;
    if (config.numbers) allowedChars += numberChars;
    if (config.symbols) allowedChars += symbolChars;

    // Remove excluded characters
    allowedChars = allowedChars
        .split('')
        .filter((char) => !config.excludedChars.includes(char))
        .join('');

    let password = '';
    const randomBytes = crypto.randomBytes(config.length);

    // Ensure at least one character from each required type
    if (config.uppercase)
        password += uppercaseChars[randomBytes[0] % uppercaseChars.length];
    if (config.lowercase)
        password += lowercaseChars[randomBytes[1] % lowercaseChars.length];
    if (config.numbers)
        password += numberChars[randomBytes[2] % numberChars.length];
    if (config.symbols)
        password += symbolChars[randomBytes[3] % symbolChars.length];

    // Fill the rest of the password
    while (password.length < config.length) {
        const randomIndex = randomBytes[password.length] % allowedChars.length;
        password += allowedChars[randomIndex];
    }

    // Shuffle the password
    password = password
        .split('')
        .sort(() => 0.5 - Math.random())
        .join('');

    return password;
}

async function getLatestVersion(service) {
    const command = `aws dynamodb scan --table-name ${TABLE_NAME} \
      --filter-expression "pk = :pk and begins_with(sk, :sk)" \
      --expression-attribute-values '{":pk":{"S":"${service}"},":sk":{"S":"version#"}}' \
      --projection-expression "sk"`;

    try {
        const { stdout } = await execAsync(command);
        const result = JSON.parse(stdout);
        if (result.Items && result.Items.length > 0) {
            const versions = result.Items.map((item) =>
                parseInt(item.sk.S.split('#')[1])
            );
            return Math.max(...versions) + 1;
        }
        return 1;
    } catch (err) {
        console.error('Error getting latest version', err);
        console.error('Command:', command);
        console.error('Stdout:', err.stdout);
        console.error('Stderr:', err.stderr);
        return 1;
    }
}

export async function generateAndStorePassword(service) {
    const password = generatePassword();
    const encryptedPassword = encrypt(password);
    const version = await getLatestVersion(service);

    const storeVersionedPassword = `aws dynamodb put-item --table-name ${TABLE_NAME} --item '{"pk": {"S": "${service}"}, "sk": {"S": "version#${version}"}, "password": {"S": "${encryptedPassword}"}, "timestamp": {"S": "${new Date().toISOString()}"}}'`;
    const updateCurrentPassword = `aws dynamodb put-item --table-name ${TABLE_NAME} --item '{"pk": {"S": "${service}"}, "sk": {"S": "current"}, "password": {"S": "${encryptedPassword}"}, "version": {"N": "${version}"}}'`;

    try {
        await execAsync(storeVersionedPassword);
        await execAsync(updateCurrentPassword);
        console.log(
            `Password for ${service} stored successfully (version ${version}).`
        );
        return password; // Return the unencrypted password for the user to see
    } catch (err) {
        console.error('Error', err);
    }
}

export async function retrievePassword(service) {
    const command = `aws dynamodb get-item --table-name ${TABLE_NAME} --key '{"pk": {"S": "${service}"}, "sk": {"S": "current"}}'`;

    try {
        const { stdout } = await execAsync(command);
        const result = JSON.parse(stdout);
        if (result.Item && result.Item.password && result.Item.password.S) {
            return decrypt(result.Item.password.S);
        } else {
            throw new Error('Password not found');
        }
    } catch (err) {
        console.error('Error', err);
        return null;
    }
}

export async function listPasswordVersions(service) {
    const command = `aws dynamodb query --table-name ${TABLE_NAME} --key-condition-expression "pk = :pk and begins_with(sk, :sk)" --expression-attribute-values '{":pk":{"S":"${service}"},":sk":{"S":"version#"}}' --projection-expression "sk, timestamp" --scan-index-forward false`;

    try {
        const { stdout } = await execAsync(command);
        const result = JSON.parse(stdout);
        return result.Items.map((item) => ({
            version: parseInt(item.sk.S.split('#')[1]),
            timestamp: item.timestamp.S,
        }));
    } catch (err) {
        console.error('Error listing password versions', err);
        return [];
    }
}

export async function retrievePasswordVersion(service, version) {
    const command = `aws dynamodb get-item --table-name ${TABLE_NAME} --key '{"pk": {"S": "${service}"}, "sk": {"S": "version#${version}"}}'`;

    try {
        const { stdout } = await execAsync(command);
        const result = JSON.parse(stdout);
        if (result.Item && result.Item.password && result.Item.password.S) {
            return decrypt(result.Item.password.S);
        } else {
            throw new Error(
                `Password version ${version} not found for ${service}`
            );
        }
    } catch (err) {
        console.error('Error', err);
        return null;
    }
}

export async function setCurrentPasswordVersion(service, version) {
    const getCommand = `aws dynamodb get-item --table-name ${TABLE_NAME} --key '{"pk": {"S": "${service}"}, "sk": {"S": "version#${version}"}}'`;

    try {
        const { stdout } = await execAsync(getCommand);
        const result = JSON.parse(stdout);
        if (result.Item && result.Item.password && result.Item.password.S) {
            const updateCommand = `aws dynamodb put-item --table-name ${TABLE_NAME} --item '{"pk": {"S": "${service}"}, "sk": {"S": "current"}, "password": {"S": "${result.Item.password.S}"}, "version": {"N": "${version}"}}'`;
            await execAsync(updateCommand);
            console.log(
                `Current password for ${service} set to version ${version}`
            );
        } else {
            throw new Error(
                `Password version ${version} not found for ${service}`
            );
        }
    } catch (err) {
        console.error('Error', err);
    }
}

export async function listAllServices() {
    const command = `aws dynamodb scan --table-name ${TABLE_NAME} \
      --filter-expression "sk = :sk" \
      --expression-attribute-values '{":sk":{"S":"current"}}' \
      --projection-expression "pk"`;

    try {
        const { stdout } = await execAsync(command);
        const result = JSON.parse(stdout);
        if (result.Items && result.Items.length > 0) {
            const services = result.Items.map((item) => item.pk.S);
            return services;
        }
        return [];
    } catch (err) {
        console.error('Error listing services', err);
        console.error('Command:', command);
        console.error('Stdout:', err.stdout);
        console.error('Stderr:', err.stderr);
        return [];
    }
}

export async function setExistingPassword(service, password) {
    const encryptedPassword = encrypt(password);
    const version = await getLatestVersion(service);

    const storeVersionedPassword = `aws dynamodb put-item --table-name ${TABLE_NAME} --item '{"pk": {"S": "${service}"}, "sk": {"S": "version#${version}"}, "password": {"S": "${encryptedPassword}"}, "timestamp": {"S": "${new Date().toISOString()}"}}'`;

    const updateCurrentPassword = `aws dynamodb put-item --table-name ${TABLE_NAME} --item '{"pk": {"S": "${service}"}, "sk": {"S": "current"}, "password": {"S": "${encryptedPassword}"}, "version": {"N": "${version}"}}'`;

    try {
        await execAsync(storeVersionedPassword);
        await execAsync(updateCurrentPassword);
        console.log(
            `Existing password for ${service} stored successfully (version ${version}).`
        );
        return true; // Indicate success
    } catch (err) {
        console.error('Error storing existing password', err);
        return false; // Indicate failure
    }
}
