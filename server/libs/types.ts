export type messageType = {
    type: string,
    message: string,
}

type linkResData = {
	title: string,
	description: string,
	image: string,
	url: string
}

export type linkRes = {
	success: boolean,
	data: linkResData | null,
	error: string | null
}