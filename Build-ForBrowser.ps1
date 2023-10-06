param(
    [string]$browser
)

# Create distribution folder
$distFolder = "dist/$browser"
if (Test-Path $distFolder) {
    Remove-Item -Recurse -Force $distFolder
}
New-Item -ItemType Directory -Force -Path $distFolder

# Copy files except manifest.in.json
Get-ChildItem -Path 'src' -Exclude 'manifest.in.json' | 
Copy-Item -Destination $distFolder -Recurse

$inputFile = 'src/manifest.in.json' 

$processedLines = @()
$pattern = $browser

# Read each line from the input file
Get-Content $inputFile | ForEach-Object {
    # Capture leading whitespace and line content separately
    if ($_ -match "^(?<leadingWhitespace>\s*)//${pattern}:(?<content>.*)") {
        # Append captured content with original leading whitespace
        $processedLines += ($matches['leadingWhitespace'] + $matches['content'].Trim())
    } elseif ($_ -notmatch "^\s*//.*:") {
        # If line doesn't match any pattern, append as-is
        $processedLines += $_
    }
    # Lines matching other patterns are skipped
}

# Write processed lines to output file
$processedLines | Out-File "${distfolder}/manifest.json"

# Zip the whole caboodle
Compress-Archive -Path "${distFolder}/*" -DestinationPath "dist/${browser}.zip" -Force
