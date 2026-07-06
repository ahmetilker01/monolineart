import { removeBackground } from '@imgly/background-removal';
removeBackground('https://via.placeholder.com/150').then(b => console.log('success!', b.size)).catch(e => console.error('failed!', e.message));
