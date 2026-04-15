(async () => {
    // allows the old 'pkg' tool to load modern 'import' code
    await import('./client.js');
})();