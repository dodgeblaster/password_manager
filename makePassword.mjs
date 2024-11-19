import {
    generateAndStorePassword,
    setEncryptionKey,
} from './passwordManager.mjs';
import { askVisible, adkHidden, closeRl } from './ui.mjs';

async function main() {
    try {
        const encryptionKey = await adkHidden(
            'Please enter the ENCRYPTION_KEY: '
        );
        setEncryptionKey(encryptionKey); // You'll need to add this function to your main script

        const service = await askVisible('Please enter the Service: ');
        const res = await generateAndStorePassword(service);
        console.log(res);
    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        closeRl();
    }
}

main();
