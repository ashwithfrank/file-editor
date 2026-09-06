document.addEventListener('DOMContentLoaded', () => {
    const fileList = document.getElementById('file-list');

    // Example directory path (replace with your actual directory)
    const directoryPath = '/path/to/your/directory';

    // Function to list files in the directory
    function listFiles() {
        fetch(`${directoryPath}`)
            .then(response => response.json())
            .then(data => {
                data.files.forEach(file => {
                    const li = document.createElement('li');
                    li.textContent = file.name;
                    fileList.appendChild(li);
                });
            })
            .catch(error => console.error('Error fetching files:', error));
    }

    // Call the function to list files
    listFiles();
});