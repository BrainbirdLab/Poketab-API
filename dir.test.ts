

try{
    const dir = await Deno.stat(`./uploads/testDir`);
    console.log(dir);
    if (dir.isDirectory && dir.size === 0){
        await Deno.remove(`./uploads/g3-NaI-96`);
        console.log('Directory deleted');
    }
} catch (_) {
    console.log("Folder not found");
}
