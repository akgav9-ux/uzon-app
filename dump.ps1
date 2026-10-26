$files = @(
  "package.json",
  "next.config.js","next.config.mjs","next.config.ts",
  "src\middleware.ts","middleware.ts",
  "src\components\providers.tsx",
  "src\components\PwaRegister.tsx",
  "src\lib\client\api.ts",
  "src\components\stories.tsx",
  "src\components\post.tsx",
  "src\lib\s3.ts",
  "src\lib\media.ts",
  "src\lib\storage.ts",
  "src\app\api\upload\presigned\route.ts",
  "src\app\api\media\route.ts",
  "src\app\api\media\[key]\route.ts",
  "public\sw.js",
  "public\manifest.json",
  "public\manifest.webmanifest",
  ".env.example"
)

$out = "dump-output.txt"
Remove-Item $out -ErrorAction SilentlyContinue

foreach ($f in $files) {
  if (Test-Path -LiteralPath $f) {
    Add-Content $out "`n===== FILE: $f ====="
    Get-Content -LiteralPath $f -Raw | Add-Content $out
  } else {
    Add-Content $out "`n----- MISSING: $f -----"
  }
}

Write-Host "Готово. Смотри файл: $out"