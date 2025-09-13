#!/bin/bash

# Generate PWA icons from SVG
# This script requires ImageMagick to be installed

SIZES=(72 96 128 144 152 192 384 512)
SVG_FILE="public/icons/icon.svg"
OUTPUT_DIR="public/icons"

echo "Generating PWA icons..."

for size in "${SIZES[@]}"; do
    output_file="${OUTPUT_DIR}/icon-${size}x${size}.png"
    
    # Check if ImageMagick is available
    if command -v magick &> /dev/null; then
        magick -background none -size ${size}x${size} "$SVG_FILE" "$output_file"
        echo "Generated: $output_file"
    elif command -v convert &> /dev/null; then
        convert -background none -size ${size}x${size} "$SVG_FILE" "$output_file"
        echo "Generated: $output_file"
    else
        echo "Error: ImageMagick not found. Please install it or manually create ${size}x${size} PNG icons."
        echo "You can also use online tools to convert the SVG to PNG icons."
        break
    fi
done

echo "Icon generation complete!"
echo "Note: If ImageMagick is not available, you can:"
echo "1. Install ImageMagick: sudo apt-get install imagemagick (Ubuntu/Debian)"
echo "2. Or use online tools to convert public/icons/icon.svg to the required PNG sizes"
