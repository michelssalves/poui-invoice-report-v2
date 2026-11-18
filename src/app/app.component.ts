import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

import {
  PoBreadcrumbItem,
  PoBreadcrumbModule,
  PoMenuItem,
  PoMenuModule,
  PoNotificationService,
  PoPageModule,
  PoToolbarModule
} from '@po-ui/ng-components';

import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AppComponentService } from './app.component.service';
import { ProtheusCanalService } from './core/webchannel/protheus-canal.service';

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    PoToolbarModule,
    PoMenuModule,
    PoPageModule,
    PoBreadcrumbModule,
    RouterOutlet
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  providers: [AppComponentService]
})
export class AppComponent {

  breadcrumbItems: PoBreadcrumbItem[] = [];

  menuItemSelected: string = '';

  menus: Array<PoMenuItem> = [

    {
      label: 'Fiscal',
      icon: 'an an-newspaper',
      shortLabel: 'Fiscal',
      subItems: [
        { label: 'Rcap', action: this.relatorioRcapClick.bind(this) }
      ]
    },
    {
      label: 'Sair',
      icon: 'an an-door-open',
      shortLabel: 'Sair',
      action: this.closeApp.bind(this)
    }

  ];

  constructor(
    public AppComponentService: AppComponentService,
    private canal: ProtheusCanalService,
    private notificacao: PoNotificationService,
    private router: Router,
    private activatedRoute: ActivatedRoute,
  ) {
    this.atualizaTituloDinamico()
    this.menuItemSelected = 'Relatório'

    if (this.router.url === '/' || this.router.url === '') {
      this.router.navigate(['/relatorio-rcap']);
    }
  }

  printMenuAction(menu: PoMenuItem) {
    this.menuItemSelected = menu.label;
  }

  private atualizaTituloDinamico() {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      let route = this.activatedRoute.firstChild;

      while (route?.firstChild) {
        route = route.firstChild;
      }

      const breadcrumb = route?.snapshot.data?.['breadcrumb'] || '';

      this.breadcrumbItems = [
        { label: this.menuItemSelected },
        { label: breadcrumb }
      ];
    });
  }

  private relatorioRcapClick() {
    this.router.navigate(['/', 'relatorio-rcap']);
  }

  /** Fecha a tela pelo FwCallApp (tipo "close", tratado pelo próprio framework). */
  private closeApp() {
    if (this.canal.modoDemo) {
      this.notificacao.information('Demonstração: no Protheus o Sair fecha a tela e volta ao menu.');
      return;
    }

    if (!this.canal.fechar()) {
      this.notificacao.error('WebChannel indisponível para fechar a tela.');
    }
  }
}
