package filters

import (
	"context"
	"fmt"

	"nhi-backend-api/internal/identitygraph"
	"nhi-backend-api/internal/platform/scope"
)

type FilterService struct {
	filterRepo *FilterRepository
	resolver   *scope.Resolver
}

func NewFilterService(filterRepo *FilterRepository, resolver *scope.Resolver) *FilterService {
	return &FilterService{filterRepo: filterRepo, resolver: resolver}
}

func (s *FilterService) GetFilters(ctx context.Context, userID, tenantID, dbName string) (*identitygraph.FilterResponse, error) {
	resolved, err := s.resolver.Resolve(ctx, userID, tenantID, dbName)
	if err != nil {
		return nil, err
	}
	result, err := s.filterRepo.GetFilterOptions(ctx, resolved)
	if err != nil {
		return nil, fmt.Errorf("load tenant filter options: %w", err)
	}
	return result, nil
}
