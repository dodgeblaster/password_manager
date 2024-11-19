import { listAllServices } from './passwordManager.mjs';

async function main() {
    const res = await listAllServices();
    console.log(res);
}

main();
