mkdir steno-notes && cd steno-notes
# save the three files above into this folder
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
