package engine

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

const maxUploadedPDFPageImages = 20

type sourceCopy struct {
	from string
	name string
}

func validateSources(root string, sources []string) ([]sourceCopy, map[string]string, error) {
	if len(sources) > 5 {
		return nil, nil, fmt.Errorf("--source accepts 1 to 5 uploaded files")
	}
	if len(sources) == 0 {
		return nil, map[string]string{}, nil
	}
	uploads := filepath.Join(root, ".subidas")
	uploadsReal, err := filepath.EvalSymlinks(uploads)
	if err != nil || uploadsReal != uploads {
		return nil, nil, fmt.Errorf("source is not an uploaded file under .subidas: %s", sources[0])
	}
	if info, err := os.Stat(uploadsReal); err != nil || !info.IsDir() {
		return nil, nil, fmt.Errorf("source is not an uploaded file under .subidas: %s", sources[0])
	}

	copies := make([]sourceCopy, 0, len(sources))
	targetNames := make(map[string]bool)
	sourceTargets := make(map[string]string, len(sources))
	addCopy := func(copy sourceCopy) error {
		key := strings.ToLower(copy.name)
		if targetNames[key] {
			return fmt.Errorf("sources contain duplicate filenames: %s", copy.name)
		}
		targetNames[key] = true
		copies = append(copies, copy)
		return nil
	}
	resolve := func(path string) (sourceCopy, error) {
		if !filepath.IsAbs(path) {
			return sourceCopy{}, fmt.Errorf("source is not an uploaded file under .subidas: %s", path)
		}
		real, err := filepath.EvalSymlinks(path)
		if err != nil {
			return sourceCopy{}, fmt.Errorf("source is not an uploaded file under .subidas: %s", path)
		}
		rel, err := filepath.Rel(uploadsReal, real)
		if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
			return sourceCopy{}, fmt.Errorf("source is not an uploaded file under .subidas: %s", path)
		}
		info, err := os.Stat(real)
		if err != nil || !info.Mode().IsRegular() {
			return sourceCopy{}, fmt.Errorf("source is not an uploaded file under .subidas: %s", path)
		}
		return sourceCopy{from: real, name: filepath.Base(path)}, nil
	}

	for _, source := range sources {
		primary, err := resolve(source)
		if err != nil {
			return nil, nil, err
		}
		if err := addCopy(primary); err != nil {
			return nil, nil, err
		}
		sourceTargets[filepath.Clean(source)] = filepath.ToSlash(filepath.Join("fuentes", primary.name))
		if strings.ToLower(filepath.Ext(primary.name)) != ".pdf" {
			continue
		}

		textPath := source + ".txt"
		text, err := resolve(textPath)
		if err != nil {
			return nil, nil, fmt.Errorf("PDF source is missing its extracted .txt sibling: %s", source)
		}
		if err := addCopy(text); err != nil {
			return nil, nil, err
		}
		pages := make([]int, 0, maxUploadedPDFPageImages)
		for page := 1; page <= maxUploadedPDFPageImages; page++ {
			pagePath := fmt.Sprintf("%s.p%d.png", source, page)
			if _, err := os.Lstat(pagePath); os.IsNotExist(err) {
				continue
			} else if err != nil {
				return nil, nil, fmt.Errorf("PDF source page image is unavailable: %s", pagePath)
			}
			image, err := resolve(pagePath)
			if err != nil {
				return nil, nil, fmt.Errorf("PDF source page image is not an uploaded file: %s", pagePath)
			}
			if err := addCopy(image); err != nil {
				return nil, nil, err
			}
			pages = append(pages, page)
		}
		for index, page := range pages {
			if page != index+1 {
				return nil, nil, fmt.Errorf("PDF source has non-contiguous page images: %s", source)
			}
		}
	}
	return copies, sourceTargets, nil
}

func validateSourceTargets(ws string, copies []sourceCopy) error {
	if len(copies) == 0 {
		return nil
	}
	fuentes := filepath.Join(ws, "fuentes")
	info, err := os.Lstat(fuentes)
	if err == nil {
		if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
			return fmt.Errorf("topic fuentes path is not a directory inside the topic: %s", fuentes)
		}
	} else if !os.IsNotExist(err) {
		return fmt.Errorf("cannot inspect topic fuentes: %w", err)
	}
	for _, copy := range copies {
		path := filepath.Join(fuentes, copy.name)
		if _, err := os.Lstat(path); err == nil {
			return fmt.Errorf("topic fuentes already contains %s", copy.name)
		} else if !os.IsNotExist(err) {
			return fmt.Errorf("cannot inspect topic source target %s: %w", copy.name, err)
		}
	}
	return nil
}

func copyUploadedSources(ws string, copies []sourceCopy) (created []string, createdFuentes bool, err error) {
	if len(copies) == 0 {
		return nil, false, nil
	}
	fuentes := filepath.Join(ws, "fuentes")
	info, err := os.Lstat(fuentes)
	if os.IsNotExist(err) {
		if err := os.Mkdir(fuentes, 0o755); err != nil {
			return nil, false, fmt.Errorf("cannot create topic fuentes directory: %w", err)
		}
		createdFuentes = true
	} else if err != nil {
		return nil, false, fmt.Errorf("cannot inspect topic fuentes: %w", err)
	} else if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return nil, false, fmt.Errorf("topic fuentes path is not a directory inside the topic: %s", fuentes)
	}
	for _, copy := range copies {
		input, err := os.Open(copy.from)
		if err != nil {
			return created, createdFuentes, fmt.Errorf("cannot read uploaded source %s: %w", copy.name, err)
		}
		path := filepath.Join(fuentes, copy.name)
		output, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
		if err != nil {
			_ = input.Close()
			return created, createdFuentes, fmt.Errorf("cannot stage uploaded source %s: %w", copy.name, err)
		}
		created = append(created, path)
		_, copyErr := io.Copy(output, input)
		inputErr := input.Close()
		outputErr := output.Close()
		if copyErr != nil {
			return created, createdFuentes, fmt.Errorf("cannot stage uploaded source %s: %w", copy.name, copyErr)
		}
		if inputErr != nil {
			return created, createdFuentes, fmt.Errorf("cannot read uploaded source %s: %w", copy.name, inputErr)
		}
		if outputErr != nil {
			return created, createdFuentes, fmt.Errorf("cannot finish staging uploaded source %s: %w", copy.name, outputErr)
		}
	}
	return created, createdFuentes, nil
}

func rollbackUploadedSources(created []string, createdFuentes bool, ws string) {
	for _, path := range created {
		_ = os.Remove(path)
	}
	if createdFuentes {
		_ = os.Remove(filepath.Join(ws, "fuentes"))
	}
}
