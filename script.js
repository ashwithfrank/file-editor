document.getElementById('new-file').addEventListener('click', function () {
    const content = document.getElementById('file-content').value;
    if (content) {
        document.getElementById('file-content').value = content;
    }
    document.getElementById('file-editor').style.display = 'block';
    document.getElementById('file-content').style.display = 'block';
});

document.getElementById('open-file').addEventListener('click', function () {
    const input = document.getElementById('file-input');
    input.click();
});

document.getElementById('file-input').addEventListener('change', function (event) {
    const content = event.target.files[0].textContent;
    document.getElementById('file-content').value = content;
    document.getElementById('file-editor').style.display = 'block';
    document.getElementById('file-content').style.display = 'block';
});

document.getElementById('save-file').addEventListener('click', function () {
    const content = document.getElementById('file-content').value;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'file.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

document.getElementById('download-file').addEventListener('click', function () {
    const content = document.getElementById('file-content').value;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'file.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});