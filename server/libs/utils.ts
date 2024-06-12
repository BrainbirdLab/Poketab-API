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

export function validatename(avatar: string) {
	return avList.includes(avatar);
}

export function validateKey(key: string) {
	const keyformat = /^[a-zA-Z0-9]{2}-[a-zA-Z0-9]{3}-[a-zA-Z0-9]{2}$/;
	return keyformat.test(key);
}

export function validateAll(key: string, avatar: string) {
	return (validateKey(key) && validatename(avatar));
}

export async function getLinkMetadata(message: string): Promise<linkRes> {

	try {

		const regex = /https?:\/\/[^\s]+/g;
		const link = message.match(regex);

		if (link) {
			const url = link[0];
			const html = await fetch(url).then((res) => res.text());
			const titleRegex = /<title[^>]*>([^<]+)<\/title>/g;
			const descriptionRegex = /<meta[^>]*avatar="description"[^>]*content="([^"]*)"[^>]*>/g;
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
			return {
				success: true,
				error: null,
				data: null,
			};
		}
	} catch (_) {
		return {
			success: false,
			error: 'Error fetching link metadata',
			data: null,
		};
	}
}