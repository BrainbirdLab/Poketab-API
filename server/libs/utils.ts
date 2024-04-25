import { linkRes } from "./types.ts";

export const avList = [
	'Mankey', 
	'Meowth', 
	'Mew', 
	'Squirtle', 
	'Charmander', 
	'Psyduck', 
	'Caterpie', 
	'Eevee', 
	'Haunter', 
	'Mewtwo', 
	'Jigglypuff', 
	'Pichu', 
	'Pidgey', 
	'Pikachu', 
	'Dratini', 
	'Raichu', 
	'Zubat', 
	'Articuno', 
	'Bellsprout', 
	'Blastoise', 
	'Bulbasaur', 
	'Charizard', 
	'Rattata', 
	'Rayquaza', 
	'Snorlax', 
	'Ivysaur', 
	'Palkia'
];



export const isRealString = (str: string) => {
	return typeof str === 'string' && str.trim().length > 0;
};

export function validatepokemon(pokemon: string) {
	return avList.includes(pokemon);
}

export function validateKey(key: string) {
	const keyformat = /^[a-zA-Z0-9]{2}-[a-zA-Z0-9]{3}-[a-zA-Z0-9]{2}$/;
	return keyformat.test(key);
}

export function validateAll(key: string, pokemon: string) {
	return (validateKey(key) && validatepokemon(pokemon));
}

export async function getLinkMetadata(message: string): Promise<linkRes> {

	try {

		const regex = /https?:\/\/[^\s]+/g;
		const link = message.match(regex);

		if (link) {
			const url = link[0];
			const html = await fetch(url).then((res) => res.text());
			const titleRegex = /<title[^>]*>([^<]+)<\/title>/g;
			const descriptionRegex = /<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/g;
			const imageRegex = /<meta[^>]*property="og:image"[^>]*content="([^"]*)"[^>]*>/g;

			const title = titleRegex.exec(html)?.[1] || '';
			const description = descriptionRegex.exec(html)?.[1] || '';
			let image = imageRegex.exec(html)?.[1] || '';

			//if image path is relative, convert it to absolute
			if (image && image.startsWith('/')) {
				const urlObject = new URL(url);
				image = `${urlObject.protocol}//${urlObject.host}${image}`;
			}

			//the url can be https://www.youtube.com/watch?v=12345678901. We need to convert it to https://www.youtube.com
			const urlObject = new URL(url);
			const urlWithoutPath = `${urlObject.protocol}//${urlObject.host}`;

			return {
				success: true,
				data: {
					title,
					description,
					image,
					url: urlWithoutPath,
				},
				error: null
			};

		} else {
			//console.error('No valid links found in the message.');
			return {
				success: true,
				error: null,
				data: null,
			};
		}
	} catch (_) {
		//console.error(e);
		return {
			success: false,
			error: 'Error fetching link metadata',
			data: null,
		};
	}
}

export async function cleanupFolder(path: string, onlyEmpty = false) {
	try {
		const dir = await Deno.stat(`./uploads/${path}`);
		//if onlyEmpty is false, ignore the dir.size check
		if (!dir.isDirectory) {
			return;
		}

		if (onlyEmpty && dir.size > 0) {
			await Deno.remove(`./uploads/${path}`, { recursive: true });
			console.log(`Folder ${path} deleted`);
		}

	} catch (_) {
		return;
	}
}