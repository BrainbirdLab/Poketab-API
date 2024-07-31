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